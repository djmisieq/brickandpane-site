-- Enquiries with several openings, and turning an enquiry into a portal project.
-- The public form (with or without an account) now sends a list of openings; contact-submit validates
-- it and stores it here. Staff turn the enquiry into a project from the CRM with convert_request().

alter table public.contact_requests add column if not exists openings jsonb not null default '[]'
  check (jsonb_typeof(openings) = 'array' and jsonb_array_length(openings) <= 100);

-- An invitation can hand over ownership: the project was opened by staff for someone without an account.
alter table public.project_invites add column if not exists make_owner boolean not null default false;

-- New accounts pick up pending invitations for their email; an owner invitation also makes them the project owner.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, company, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', ''),
    case when new.raw_user_meta_data->>'account_type' in ('architect', 'developer', 'homeowner')
         then new.raw_user_meta_data->>'account_type' else 'architect' end
  );
  insert into public.project_members (project_id, user_id, role)
    select project_id, new.id, case when make_owner then 'owner' else role end
    from public.project_invites where email = lower(new.email)
    on conflict do nothing;
  update public.projects set owner_id = new.id
    where id in (select project_id from public.project_invites where email = lower(new.email) and make_owner);
  delete from public.project_invites where email = lower(new.email);
  return new;
end $$;

-- Staff only. Creates the project with the enquiry's openings and links the two.
-- Owner: the account with the same confirmed email, if there is one. Otherwise the project is held by
-- the staff member (who is not left on the team) and an owner invitation waits for that email.
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
    insert into public.project_invites (project_id, email, role, invited_by, make_owner)
      values (pid, lower(req.email), 'client', me, true)
      on conflict (project_id, email) do update set make_owner = true;
  end if;

  update public.project_internal set notes = coalesce(req.staff_note, '') where project_id = pid;
  update public.contact_requests set status = 'converted', project_id = pid where id = r;
  return pid;
end $$;

revoke all on function public.convert_request(uuid) from public, anon;
grant execute on function public.convert_request(uuid) to authenticated;
