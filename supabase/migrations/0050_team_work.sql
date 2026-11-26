-- Projects audit of 26.11.2026, teamwork: the CRM now leads people through a project. Additive only.
--  1. stage_playbook: the tasks each stage starts (book the survey, order from the supplier, the handover pack...).
--     A stage change creates them for the project's account manager, once per project; the team edits the list.
--     A missing or switched-off playbook never blocks a stage change.
--  2. Team notifications: a new account manager hears that the project is theirs, a person hears about a task given
--     to them, and "@Name" in an internal note reaches that person. Nothing here ever reaches a client.
--  3. project_bookings: surveys, deliveries, fitting and service visits as dated entries with a crew (a company,
--     e.g. the subcontractor) or a staff member, for the calendar. The client still sees only delivery and fitting.

-- ---------- 1. the playbook ----------
create table if not exists public.stage_playbook (
  id uuid primary key default gen_random_uuid(),
  to_stage public.project_stage not null,
  title text not null check (length(trim(title)) between 1 and 300),
  kind text not null default 'task' check (kind in ('task', 'call', 'email', 'visit')),
  offset_days int not null default 1 check (offset_days between 0 and 90),
  sort int not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists stage_playbook_stage on public.stage_playbook (to_stage, sort);
alter table public.stage_playbook enable row level security;
drop policy if exists "stage_playbook staff" on public.stage_playbook;
create policy "stage_playbook staff" on public.stage_playbook for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.stage_playbook from anon, authenticated;
grant select, insert, update, delete on public.stage_playbook to authenticated;

alter table public.tasks add column if not exists template_id uuid references public.stage_playbook (id) on delete set null;

-- The starting playbook, only when the table is empty (a second run adds nothing).
insert into public.stage_playbook (to_stage, title, kind, offset_days, sort)
select v.s::public.project_stage, v.t, v.k, v.d, v.o from (values
  ('in_review', 'Check the drawings and the openings; list the questions for the client', 'task', 1, 1),
  ('quote_issued', 'Follow up the quotation', 'call', 5, 1),
  ('accepted', 'Book the survey with the client', 'call', 1, 1),
  ('accepted', 'Send the deposit invoice', 'task', 1, 2),
  ('survey', 'Enter the measured sizes and photos', 'task', 1, 1),
  ('drawings', 'Send the shop drawings for approval', 'task', 2, 1),
  ('production', 'Place the order with the supplier', 'task', 1, 1),
  ('production', 'Enter the supplier''s confirmation and production date', 'task', 3, 2),
  ('delivery', 'Confirm transport, access and unloading', 'call', 1, 1),
  ('delivery', 'Book the fitting crew', 'task', 1, 2),
  ('installation', 'Handover: openings checked, photos taken', 'visit', 0, 1),
  ('handover', 'Send the O&M manual, warranty and final invoice', 'task', 2, 1),
  ('completed', 'Aftercare call', 'call', 30, 1)
) as v(s, t, k, d, o)
where not exists (select 1 from public.stage_playbook);

create or replace function public.add_workdays(d date, n int) returns date
language plpgsql immutable as $$
declare x date := d; left_ int := greatest(n, 0);
begin
  while left_ > 0 loop x := x + 1; if extract(isodow from x) < 6 then left_ := left_ - 1; end if; end loop;
  while extract(isodow from x) >= 6 loop x := x + 1; end loop;
  return x;
end $$;

create or replace function public.on_stage_playbook() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if new.from_stage is null then return null; end if; -- the creation event
  begin
    select coalesce(assignee_id, new.actor_id) into who from public.projects where id = new.project_id;
    insert into public.tasks (title, kind, due_on, assignee_id, project_id, template_id, created_by)
    select b.title, b.kind, public.add_workdays(current_date, b.offset_days), who, new.project_id, b.id, new.actor_id
    from public.stage_playbook b
    where b.active and b.to_stage = new.to_stage
      and not exists (select 1 from public.tasks t where t.project_id = new.project_id and t.template_id = b.id)
    order by b.sort;
  exception when others then
    raise warning 'stage playbook skipped: %', sqlerrm; -- a playbook problem never blocks the stage change
  end;
  return null;
end $$;
revoke execute on function public.on_stage_playbook() from public, anon, authenticated;
drop trigger if exists stage_events_playbook on public.stage_events;
create trigger stage_events_playbook after insert on public.stage_events for each row execute function public.on_stage_playbook();

-- ---------- 2. team notifications ----------
create or replace function public.on_assignee_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and new.assignee_id is distinct from old.assignee_id
     and new.assignee_id is distinct from auth.uid()
     and exists (select 1 from public.profiles where id = new.assignee_id and role = 'staff') then
    insert into public.notifications (user_id, project_id, type, title, body)
    values (new.assignee_id, new.id, 'assigned', 'You now look after: ' || new.name, new.ref);
  end if;
  return null;
end $$;
revoke execute on function public.on_assignee_change() from public, anon, authenticated;
drop trigger if exists projects_assignee_notify on public.projects;
create trigger projects_assignee_notify after update of assignee_id on public.projects for each row execute function public.on_assignee_change();

create or replace function public.on_task_assigned() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.assignee_id is not null and new.done_at is null and new.assignee_id is distinct from auth.uid()
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id) then
    insert into public.notifications (user_id, project_id, type, title, body)
    values (new.assignee_id, new.project_id, 'task', 'Task for you: ' || new.title,
      coalesce((select p.ref || ' · ' || p.name from public.projects p where p.id = new.project_id), '') ||
      case when new.due_on is not null then ' · by ' || to_char(new.due_on, 'DD Mon') else '' end);
  end if;
  return null;
end $$;
revoke execute on function public.on_task_assigned() from public, anon, authenticated;
drop trigger if exists tasks_assigned_notify on public.tasks;
create trigger tasks_assigned_notify after insert or update of assignee_id on public.tasks for each row execute function public.on_task_assigned();

-- "@Kate" (the first name, any case) in an internal note notifies that staff member.
create or replace function public.on_internal_mention() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if not new.internal or position('@' in new.body) = 0 then return null; end if;
  select ref || ' · ' || name into pname from public.projects where id = new.project_id;
  insert into public.notifications (user_id, project_id, type, title, body)
  select p.id, new.project_id, 'mention', 'You were mentioned: ' || coalesce(pname, ''), left(new.body, 200)
  from public.profiles p
  where p.role = 'staff' and p.id is distinct from new.author_id and coalesce(p.full_name, '') <> ''
    and new.body ~* ('(^|[^[:alnum:]_])@' || regexp_replace(split_part(trim(p.full_name), ' ', 1), '([^[:alnum:]])', '\\\1', 'g') || '([^[:alnum:]_]|$)');
  return null;
end $$;
revoke execute on function public.on_internal_mention() from public, anon, authenticated;
drop trigger if exists messages_mention on public.messages;
create trigger messages_mention after insert on public.messages for each row execute function public.on_internal_mention();

-- ---------- 3. bookings ----------
create table if not exists public.project_bookings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind text not null default 'install' check (kind in ('survey', 'delivery', 'install', 'service', 'other')),
  starts_on date not null,
  ends_on date not null,
  crew_company_id uuid references public.companies (id) on delete set null,
  staff_id uuid references public.profiles (id) on delete set null,
  note text not null default '' check (length(note) <= 500),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on >= starts_on and ends_on <= starts_on + 60)
);
create index if not exists project_bookings_when on public.project_bookings (starts_on, ends_on);
create index if not exists project_bookings_project on public.project_bookings (project_id);
alter table public.project_bookings enable row level security;
drop policy if exists "project_bookings staff" on public.project_bookings;
create policy "project_bookings staff" on public.project_bookings for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.project_bookings from anon, authenticated;
grant select, delete on public.project_bookings to authenticated;
grant insert (project_id, kind, starts_on, ends_on, crew_company_id, staff_id, note) on public.project_bookings to authenticated;
grant update (kind, starts_on, ends_on, crew_company_id, staff_id, note) on public.project_bookings to authenticated;
drop trigger if exists project_bookings_touch on public.project_bookings;
create trigger project_bookings_touch before update on public.project_bookings for each row execute function public.crm_touch();
drop trigger if exists crm_log_bookings on public.project_bookings;
create trigger crm_log_bookings after insert or delete or update on public.project_bookings for each row
  execute function public.crm_log_change('project_id', 'booking', 'id', 'kind', 'starts_on', 'ends_on', 'crew_company_id', 'staff_id');

-- A crew company on a booking keeps it off the cold-list deletion.
create or replace function public.purge_cold_prospects() returns jsonb
language plpgsql security definer set search_path = public as $$
declare gone_people int; gone_companies int;
begin
  with doomed as (
    select c.id from public.companies c
    where c.source = 'cold' and not c.do_not_contact
      and coalesce(c.last_contacted_at, c.created_at) < now() - interval '12 months'
      and not exists (select 1 from public.project_companies pc where pc.company_id = c.id)
      and not exists (select 1 from public.supplier_quotes sq where sq.company_id = c.id)
      and not exists (select 1 from public.contact_requests cr where cr.company_id = c.id)
      and not exists (select 1 from public.project_bookings pb where pb.crew_company_id = c.id)
      and not exists (select 1 from public.people p where p.company_id = c.id and (p.profile_id is not null or p.do_not_contact
        or p.last_contacted_at >= now() - interval '12 months'
        or exists (select 1 from public.project_people pp where pp.person_id = p.id)
        or exists (select 1 from public.contact_requests cr where cr.person_id = p.id)))
  ), dp as (
    delete from public.people p using doomed d where p.company_id = d.id returning 1
  ), dc as (
    delete from public.companies c using doomed d where c.id = d.id returning 1
  )
  select (select count(*) from dp), (select count(*) from dc) into gone_people, gone_companies;
  update public.companies set notes = '' where source = 'cold' and do_not_contact and notes <> '';
  return jsonb_build_object('people', gone_people, 'companies', gone_companies);
end $$;
revoke execute on function public.purge_cold_prospects() from public, anon, authenticated;

do $$ declare t text; begin
  foreach t in array array['project_bookings', 'stage_playbook'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
