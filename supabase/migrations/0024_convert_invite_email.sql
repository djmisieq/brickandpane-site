-- Enquiry → project, after the leads bot's live test (01.11.2026):
-- 1. Staff may email the client an invitation when converting (owner decision 01.11: a choice in the panel,
--    on by default). convert_enquiry() marks the pending invite; the invite-email Edge Function sends it once.
-- 2. An enquiry whose email belongs to a staff account gets no invitation: the project stays without a client and
--    the panel says so (owner decision 01.11). Before, an invite to the staff address waited forever.
-- 3. Stage emails carry the stage's label ("Quote issued"), not the raw value ("quote issued").
-- No create extension here (0006 has pg_net), so tests/db runs it; a failed call never blocks the conversion.

alter table public.project_invites add column if not exists send_email boolean not null default false;
alter table public.project_invites add column if not exists emailed_at timestamptz;

create or replace function public.is_staff_email(addr text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(addr) and p.role = 'staff');
$$;
revoke execute on function public.is_staff_email(text) from public, anon, authenticated;

create or replace function public.convert_request(r uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare req public.contact_requests; me uuid := auth.uid(); client uuid; pid uuid;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into req from public.contact_requests where id = r for update;
  if req.id is null then raise exception 'Enquiry not found.'; end if;
  if req.project_id is not null then return req.project_id; end if;

  select u.id into client from auth.users u join public.profiles p on p.id = u.id
    where lower(u.email) = lower(req.email) and u.email_confirmed_at is not null and p.role <> 'staff' limit 1;

  insert into public.projects (name, owner_id, assignee_id, location, riba_stage, building_type, systems, start_window, brief)
  values (
    left(coalesce(nullif(req.company, ''), req.name) || coalesce(', ' || nullif(req.location, ''), ''), 200),
    coalesce(client, me), me, coalesce(req.location, ''), coalesce(req.riba_stage, ''), coalesce(req.building, ''),
    array(select distinct s from unnest(req.systems) s where s <> 'unsure'),
    coalesce(req.start, ''), coalesce(req.message, '')
  ) returning id into pid;

  if jsonb_array_length(req.openings) > 0 then
    insert into public.openings (project_id, ref, system, material, width_mm, height_mm, config, glazing, qty, notes)
    select pid, left(coalesce(o->>'ref', ''), 20), coalesce(nullif(o->>'system', ''), 'windows'),
      case when o->>'material' in ('alu', 'timber', 'pvc', 'alutimber') then o->>'material' else '' end,
      case when (o->>'width_mm')::int between 300 and 30000 then (o->>'width_mm')::int end,
      case when (o->>'height_mm')::int between 300 and 6000 then (o->>'height_mm')::int end,
      left(coalesce(o->>'config', ''), 10), left(coalesce(o->>'glazing', ''), 4),
      greatest(least(coalesce((o->>'qty')::int, 1), 999), 1), left(coalesce(o->>'note', ''), 200)
    from jsonb_array_elements(req.openings) o;
  elsif req.opening_width_mm between 300 and 30000 then
    -- Older enquiries carried one opening in two columns.
    insert into public.openings (project_id, ref, system, width_mm, height_mm, qty)
    values (pid, 'D01', coalesce((select s from unnest(req.systems) s where s <> 'unsure' limit 1), 'lift-slide'),
      req.opening_width_mm, case when req.opening_height_mm between 300 and 6000 then req.opening_height_mm end, 1);
  end if;

  if client is null then
    delete from public.project_members where project_id = pid and user_id = me;
    if not public.is_staff_email(req.email) then
      insert into public.project_invites (project_id, email, role, invited_by, make_owner)
        values (pid, lower(req.email), 'client', me, true)
        on conflict (project_id, email) do update set make_owner = true;
    end if;
  end if;

  update public.project_internal set notes = coalesce(req.staff_note, '') where project_id = pid;
  update public.contact_requests set status = 'converted', project_id = pid where id = r;
  return pid;
end $$;

revoke all on function public.convert_request(uuid) from public, anon;
grant execute on function public.convert_request(uuid) to authenticated;

-- Asks invite-email to send one invitation. Only the id goes over; the function re-reads the row.
create or replace function public.invite_email(invite uuid) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/invite-email',
    body := jsonb_build_object('invite_id', invite),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then null; -- an email that fails never undoes the conversion
end $$;
revoke execute on function public.invite_email(uuid) from public, anon, authenticated;

-- What the panel calls. client: 'linked' (an account with that email owns the project), 'invited' (waiting for
-- the client to sign up with it) or 'staff' (the email is a staff account: no client, invite someone by hand).
create or replace function public.convert_enquiry(r uuid, send_invite boolean default false) returns jsonb
language plpgsql security definer set search_path = public as $$
declare pid uuid; inv uuid; owner_staff boolean; mail text;
begin
  pid := public.convert_request(r);
  select id into inv from public.project_invites where project_id = pid and make_owner limit 1;
  if inv is not null then
    if send_invite then
      update public.project_invites set send_email = true where id = inv and emailed_at is null;
      perform public.invite_email(inv);
    end if;
    return jsonb_build_object('project_id', pid, 'client', 'invited', 'emailed', send_invite);
  end if;
  select email into mail from public.contact_requests where id = r;
  select p.role = 'staff' into owner_staff from public.projects j join public.profiles p on p.id = j.owner_id where j.id = pid;
  return jsonb_build_object('project_id', pid, 'client', case when owner_staff and public.is_staff_email(mail) then 'staff' when owner_staff then 'none' else 'linked' end, 'emailed', false);
end $$;
revoke all on function public.convert_enquiry(uuid, boolean) from public, anon;
grant execute on function public.convert_enquiry(uuid, boolean) to authenticated;

-- Stage events: the email subject uses the label the portal shows (js/portal/core.js STAGES).
create or replace function public.stage_label(s public.project_stage) returns text
language sql immutable set search_path = public as $$
  select case s::text
    when 'submitted' then 'Received' when 'in_review' then 'Technical review' when 'clarification' then 'Questions for you'
    when 'quote_issued' then 'Quote issued' when 'accepted' then 'Order confirmed' when 'survey' then 'Site survey'
    when 'drawings' then 'Drawings for approval' when 'production' then 'In production' when 'delivery' then 'Delivery scheduled'
    when 'installation' then 'Installation' when 'handover' then 'Handover' when 'completed' then 'Completed'
    when 'on_hold' then 'On hold' when 'closed' then 'Closed'
    else initcap(replace(s::text, '_', ' ')) end;
$$;

create or replace function public.on_stage_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.from_stage is null and new.to_stage = 'submitted' then return new; end if; -- creation event
  update public.projects set stage = new.to_stage, stage_changed_at = new.created_at where id = new.project_id
    returning name into pname;
  if new.visible_to_client then
    perform public.notify_members(new.project_id, 'stage', pname || ': ' || public.stage_label(new.to_stage), new.note);
  end if;
  return new;
end $$;
