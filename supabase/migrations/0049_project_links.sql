-- Projects audit of 26.11.2026 (five reviews: UX, links, teamwork, market, foundations). Additive only: new tables,
-- new nullable columns, new functions and triggers; no existing row is changed.
--  1. crm_log: who changed which link or key fact on a project, and when (none of it was recorded before).
--  2. project_people: the people on a project (not only their company), in a role, one of them the main contact.
--  3. "Waiting on": who the ball is with (client, supplier, subcontractor) and when to chase, staff only.
--  4. Moving things between projects: supplier quotes and tasks may change project (they could not), every move logged.
--  5. attach_enquiry: a second enquiry from a known client joins the existing project instead of making a duplicate.
--  6. merge_companies / merge_people: duplicates from the import and the leads bot become one record.
--  7. set_stage: the stage change in one transaction, from the stage the row really has (two people at once).
--  8. The cold-list deletion (0047) also spares anyone on a project as a person.
--  9. Realtime for the CRM tables, so a second person sees links, tasks and notes change.

-- ---------- 1. the log ----------
create table if not exists public.crm_log (
  id bigint generated always as identity primary key,
  project_id uuid references public.projects (id) on delete cascade,
  entity text not null,
  entity_id uuid,
  field text not null,
  old_val text,
  new_val text,
  actor_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists crm_log_project on public.crm_log (project_id, created_at desc);
create index if not exists crm_log_entity on public.crm_log (entity, entity_id, created_at desc);
alter table public.crm_log enable row level security;
drop policy if exists "crm log staff read" on public.crm_log;
create policy "crm log staff read" on public.crm_log for select to authenticated using (public.is_staff());
revoke all on public.crm_log from anon, authenticated;
grant select on public.crm_log to authenticated;

-- One trigger function for every table: tg_argv = (project column or '', entity, id column, watched fields...).
-- An update logs each watched field that changed; an insert or delete logs "added"/"removed" with the watched values.
-- A change of the project column itself is logged on both projects.
create or replace function public.crm_log_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  o jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  n jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  pcol text := tg_argv[0]; ent text := tg_argv[1]; icol text := tg_argv[2];
  r jsonb := coalesce(n, o); f text; i int; pid uuid; summary text;
begin
  pid := case when pcol = '' then null else nullif(r ->> pcol, '')::uuid end;
  if tg_op = 'UPDATE' then
    for i in 3 .. tg_nargs - 1 loop
      f := tg_argv[i];
      if (o -> f) is distinct from (n -> f) then
        insert into public.crm_log (project_id, entity, entity_id, field, old_val, new_val, actor_id)
          values (pid, ent, nullif(r ->> icol, '')::uuid, f, o ->> f, n ->> f, auth.uid());
        if f = pcol and (o ->> f) is not null and (n ->> f) is not null then
          insert into public.crm_log (project_id, entity, entity_id, field, old_val, new_val, actor_id)
            values ((o ->> f)::uuid, ent, nullif(r ->> icol, '')::uuid, f, o ->> f, n ->> f, auth.uid());
        end if;
      end if;
    end loop;
  else
    select string_agg(coalesce(r ->> tg_argv[g], ''), ' · ') into summary from generate_series(3, tg_nargs - 1) g;
    insert into public.crm_log (project_id, entity, entity_id, field, old_val, new_val, actor_id)
      values (pid, ent, nullif(r ->> icol, '')::uuid, case when tg_op = 'INSERT' then 'added' else 'removed' end,
        case when tg_op = 'DELETE' then summary end, case when tg_op = 'INSERT' then summary end, auth.uid());
  end if;
  return null;
end $$;
revoke execute on function public.crm_log_change() from public, anon, authenticated;

-- ---------- 2. people on a project ----------
create table if not exists public.project_people (
  project_id uuid not null references public.projects (id) on delete cascade,
  person_id uuid not null references public.people (id) on delete cascade,
  role text not null default 'contact' check (role in ('contact', 'decision', 'site', 'accounts', 'design', 'other')),
  is_main boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (project_id, person_id)
);
create index if not exists project_people_person on public.project_people (person_id);
alter table public.project_people enable row level security;
drop policy if exists "project_people staff" on public.project_people;
create policy "project_people staff" on public.project_people for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.project_people from anon, authenticated;
grant select, insert, update, delete on public.project_people to authenticated;

-- ---------- 3. waiting on (staff only: project_internal is staff only) ----------
alter table public.project_internal
  add column if not exists waiting_on text check (waiting_on in ('client', 'supplier', 'subcontractor', 'other')),
  add column if not exists waiting_note text not null default '' check (length(waiting_note) <= 300),
  add column if not exists waiting_since timestamptz,
  add column if not exists chase_on date;

-- An enquiry can name the company and the person it came from.
alter table public.contact_requests
  add column if not exists company_id uuid references public.companies (id) on delete set null,
  add column if not exists person_id uuid references public.people (id) on delete set null;
create index if not exists people_email_lower on public.people (lower(email)) where email <> '';

-- ---------- 4. moving between projects ----------
grant update (project_id, company_id) on public.supplier_quotes to authenticated;
grant update (project_id, request_id) on public.tasks to authenticated;

do $$ begin
  drop trigger if exists crm_log_projects on public.projects;
  create trigger crm_log_projects after update on public.projects for each row
    execute function public.crm_log_change('id', 'project', 'id', 'assignee_id', 'due_at', 'delivery_at', 'install_at', 'name', 'location');
  drop trigger if exists crm_log_internal on public.project_internal;
  create trigger crm_log_internal after update on public.project_internal for each row
    execute function public.crm_log_change('project_id', 'project', 'project_id', 'waiting_on', 'value_gbp', 'probability');
  drop trigger if exists crm_log_pco on public.project_companies;
  create trigger crm_log_pco after insert or delete or update on public.project_companies for each row
    execute function public.crm_log_change('project_id', 'company', 'company_id', 'role');
  drop trigger if exists crm_log_ppl on public.project_people;
  create trigger crm_log_ppl after insert or delete or update on public.project_people for each row
    execute function public.crm_log_change('project_id', 'person', 'person_id', 'role');
  drop trigger if exists crm_log_sq on public.supplier_quotes;
  create trigger crm_log_sq after update on public.supplier_quotes for each row
    execute function public.crm_log_change('project_id', 'supplier_quote', 'id', 'project_id', 'company_id');
  drop trigger if exists crm_log_quotes on public.quotes;
  create trigger crm_log_quotes after update on public.quotes for each row
    execute function public.crm_log_change('project_id', 'quote', 'id', 'project_id');
  drop trigger if exists crm_log_tasks on public.tasks;
  create trigger crm_log_tasks after update on public.tasks for each row
    execute function public.crm_log_change('project_id', 'task', 'id', 'project_id', 'assignee_id');
  drop trigger if exists crm_log_mail on public.mail_messages;
  create trigger crm_log_mail after update on public.mail_messages for each row
    execute function public.crm_log_change('project_id', 'mail', 'id', 'project_id');
  drop trigger if exists crm_log_req on public.contact_requests;
  create trigger crm_log_req after update on public.contact_requests for each row
    execute function public.crm_log_change('project_id', 'enquiry', 'id', 'project_id', 'company_id', 'person_id');
  drop trigger if exists crm_log_people on public.people;
  create trigger crm_log_people after update on public.people for each row
    execute function public.crm_log_change('', 'person', 'id', 'company_id');
end $$;

-- Linking the enquiry to a contact goes through here (the browser may update only status and the staff note).
create or replace function public.link_enquiry_contact(r uuid, co uuid, pe uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update public.contact_requests set company_id = co, person_id = pe where id = r;
  if not found then raise exception 'Enquiry not found.'; end if;
end $$;
revoke all on function public.link_enquiry_contact(uuid, uuid, uuid) from public, anon;
grant execute on function public.link_enquiry_contact(uuid, uuid, uuid) to authenticated;

-- ---------- 5. an enquiry joins an existing project ----------
create or replace function public.attach_enquiry(r uuid, pid uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare req public.contact_requests; me uuid := auth.uid(); n int;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into req from public.contact_requests where id = r for update;
  if req.id is null then raise exception 'Enquiry not found.'; end if;
  if req.project_id is not null then raise exception 'This enquiry is already on a project.'; end if;
  if not exists (select 1 from public.projects where id = pid) then raise exception 'Project not found.'; end if;

  -- Its openings join the project's, each ref kept (or numbered after the existing ones when it is empty).
  select count(*) into n from public.openings where project_id = pid;
  if jsonb_array_length(coalesce(req.openings, '[]'::jsonb)) > 0 then
    insert into public.openings (project_id, ref, system, material, width_mm, height_mm, config, glazing, qty, notes)
    select pid, left(coalesce(nullif(o->>'ref', ''), 'E' || lpad((n + ord)::text, 2, '0')), 20), coalesce(nullif(o->>'system', ''), 'windows'),
      case when o->>'material' in ('alu', 'timber', 'pvc', 'alutimber') then o->>'material' else '' end,
      case when (o->>'width_mm')::int between 300 and 30000 then (o->>'width_mm')::int end,
      case when (o->>'height_mm')::int between 300 and 6000 then (o->>'height_mm')::int end,
      left(coalesce(o->>'config', ''), 10), left(coalesce(o->>'glazing', ''), 4),
      greatest(least(coalesce((o->>'qty')::int, 1), 999), 1), left(coalesce(o->>'note', ''), 200)
    from jsonb_array_elements(req.openings) with ordinality as x(o, ord);
  end if;

  -- The enquiry's tasks move to the project; what was written lands as an internal note, so nothing is lost.
  update public.tasks set project_id = pid, request_id = null where request_id = r;
  if coalesce(req.message, '') <> '' or coalesce(req.staff_note, '') <> '' then
    insert into public.messages (project_id, author_id, body, internal)
    values (pid, me, left('Enquiry ' || coalesce(req.ref, '') || ' added to this project.' ||
      case when coalesce(req.message, '') <> '' then E'\n\n' || req.message else '' end ||
      case when coalesce(req.staff_note, '') <> '' then E'\n\nNote: ' || req.staff_note else '' end, 10000), true);
  end if;

  -- The person who wrote can follow the project once they have an account; never a staff address.
  if not public.is_staff_email(req.email)
     and not exists (select 1 from public.project_members m join auth.users u on u.id = m.user_id where m.project_id = pid and lower(u.email) = lower(req.email))
     and not exists (select 1 from public.project_invites i where i.project_id = pid and lower(i.email) = lower(req.email)) then
    insert into public.project_invites (project_id, email, role, invited_by) values (pid, lower(req.email), 'client', me)
      on conflict (project_id, email) do nothing;
  end if;

  update public.contact_requests set status = 'converted', project_id = pid where id = r;
  return pid;
end $$;
revoke all on function public.attach_enquiry(uuid, uuid) from public, anon;
grant execute on function public.attach_enquiry(uuid, uuid) to authenticated;

-- ---------- 6. merging duplicates ----------
create or replace function public.merge_companies(keep uuid, drop_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k public.companies; d public.companies;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if keep = drop_id then raise exception 'Choose two different companies.'; end if;
  select * into k from public.companies where id = keep for update;
  select * into d from public.companies where id = drop_id for update;
  if k.id is null or d.id is null then raise exception 'Company not found.'; end if;

  update public.people set company_id = keep where company_id = drop_id;
  update public.supplier_quotes set company_id = keep where company_id = drop_id;
  update public.contact_requests set company_id = keep where company_id = drop_id;
  insert into public.project_companies (project_id, company_id, role, created_at)
    select project_id, keep, role, created_at from public.project_companies where company_id = drop_id
    on conflict do nothing;
  delete from public.project_companies where company_id = drop_id;

  update public.companies set
    website = case when website = '' then d.website else website end,
    email = case when email = '' then d.email else email end,
    phone = case when phone = '' then d.phone else phone end,
    address = case when address = '' then d.address else address end,
    notes = left(trim(both E'\n' from notes || case when d.notes <> '' and d.notes <> notes then E'\n' || d.notes else '' end), 4000),
    do_not_contact = do_not_contact or d.do_not_contact,
    last_contacted_at = greatest(last_contacted_at, d.last_contacted_at),
    -- A company the team works with is not on the cold list any more.
    source = case when source = 'cold' and coalesce(d.source, 'other') <> 'cold' then d.source else coalesce(source, d.source) end
  where id = keep;
  insert into public.crm_log (entity, entity_id, field, old_val, new_val, actor_id)
    values ('company', keep, 'merged', d.name, k.name, auth.uid());
  delete from public.companies where id = drop_id;
end $$;
revoke all on function public.merge_companies(uuid, uuid) from public, anon;
grant execute on function public.merge_companies(uuid, uuid) to authenticated;

create or replace function public.merge_people(keep uuid, drop_id uuid) returns void
language plpgsql security definer set search_path = public as $$
declare k public.people; d public.people;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if keep = drop_id then raise exception 'Choose two different people.'; end if;
  select * into k from public.people where id = keep for update;
  select * into d from public.people where id = drop_id for update;
  if k.id is null or d.id is null then raise exception 'Person not found.'; end if;
  if k.profile_id is not null and d.profile_id is not null and k.profile_id <> d.profile_id then
    raise exception 'Both people have their own portal account: they cannot be merged.';
  end if;

  insert into public.project_people (project_id, person_id, role, is_main, created_at)
    select project_id, keep, role, is_main, created_at from public.project_people where person_id = drop_id
    on conflict do nothing;
  delete from public.project_people where person_id = drop_id;
  update public.contact_requests set person_id = keep where person_id = drop_id;
  -- The account moves first: profile_id is unique.
  update public.people set profile_id = null where id = drop_id;
  update public.people set
    company_id = coalesce(company_id, d.company_id),
    job_title = case when job_title = '' then d.job_title else job_title end,
    email = case when email = '' then d.email else email end,
    phone = case when phone = '' then d.phone else phone end,
    notes = left(trim(both E'\n' from notes || case when d.notes <> '' and d.notes <> notes then E'\n' || d.notes else '' end), 4000),
    profile_id = coalesce(profile_id, d.profile_id),
    do_not_contact = do_not_contact or d.do_not_contact,
    last_contacted_at = greatest(last_contacted_at, d.last_contacted_at)
  where id = keep;
  insert into public.crm_log (entity, entity_id, field, old_val, new_val, actor_id)
    values ('person', keep, 'merged', d.full_name, k.full_name, auth.uid());
  delete from public.people where id = drop_id;
end $$;
revoke all on function public.merge_people(uuid, uuid) from public, anon;
grant execute on function public.merge_people(uuid, uuid) to authenticated;

-- ---------- 7. the stage change in one transaction ----------
create or replace function public.set_stage(pid uuid, to_stage public.project_stage, note text default '', visible boolean default false,
  next_step text default null, due_at timestamptz default null) returns void
language plpgsql security definer set search_path = public as $$
declare cur public.project_stage;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select stage into cur from public.projects where id = pid for update;
  if cur is null then raise exception 'Project not found.'; end if;
  insert into public.stage_events (project_id, from_stage, to_stage, note, visible_to_client, actor_id)
    values (pid, cur, set_stage.to_stage, coalesce(set_stage.note, ''), coalesce(visible, false), auth.uid());
  update public.projects set due_at = set_stage.due_at, next_step = coalesce(set_stage.next_step, projects.next_step) where id = pid;
end $$;
revoke all on function public.set_stage(uuid, public.project_stage, text, boolean, text, timestamptz) from public, anon;
grant execute on function public.set_stage(uuid, public.project_stage, text, boolean, text, timestamptz) to authenticated;

-- ---------- 8. the cold-list deletion spares anyone on a project ----------
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

-- ---------- 9. realtime for the CRM tables (RLS still decides who receives what) ----------
do $$ declare t text; begin
  foreach t in array array['tasks', 'project_companies', 'project_people', 'project_internal', 'supplier_quotes', 'crm_log', 'companies', 'people', 'contact_requests', 'mail_messages'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end $$;
