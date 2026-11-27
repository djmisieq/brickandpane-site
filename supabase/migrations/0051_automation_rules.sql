-- UX audit 27.11.2026, stage U2: rules that work while nobody has the CRM open. Until now "no reply for 48 h",
-- "the client has been silent for 7 days" and the chase dates were only worked out on the Today screen, so nothing
-- happened unless someone looked. run_rules() turns each into a TASK for a person (never an email to a client),
-- once per thing and cycle (automation_runs), and the team can switch each rule off or change its number of days.
-- Additive only: two new tables, one new column on tasks, one function. Nothing existing is changed or deleted.
-- pg_cron runs it every 15 minutes (0052, kept apart: pglite in tests/db has no pg_cron).

create table if not exists public.automation_rules (
  id text primary key,
  active boolean not null default true,
  days integer not null check (days between 0 and 365),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null
);
insert into public.automation_rules (id, active, days) values
  ('enquiry_unanswered', true, 1),  -- a website enquiry still "new" after n days → task to answer it
  ('client_silent', true, 7),       -- the client has the ball for n days and nobody set "waiting on" → task to chase
  ('chase_date', true, 0),          -- the chase date set under "Waiting on" arrives → task to chase
  ('booking_confirm', true, 1),     -- a survey, delivery or fitting n days away → task to confirm it
  ('payment_late', true, 3)         -- a payment n days past its due date → task to remind (a person writes it)
on conflict (id) do nothing;

create table if not exists public.automation_runs (
  id bigint generated always as identity primary key,
  rule_id text not null references public.automation_rules (id) on delete cascade,
  object_id uuid not null,
  cycle text not null default '',
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (rule_id, object_id, cycle)
);
create index if not exists automation_runs_recent on public.automation_runs (created_at desc);

-- Which rule made a task (shown as "auto" on the task). Null = made by a person or the stage playbook.
alter table public.tasks add column if not exists rule_id text references public.automation_rules (id) on delete set null;

alter table public.automation_rules enable row level security;
alter table public.automation_runs enable row level security;
drop policy if exists "rules staff read" on public.automation_rules;
create policy "rules staff read" on public.automation_rules for select to authenticated using (public.is_staff());
drop policy if exists "rules staff update" on public.automation_rules;
create policy "rules staff update" on public.automation_rules for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "runs staff read" on public.automation_runs;
create policy "runs staff read" on public.automation_runs for select to authenticated using (public.is_staff());
revoke all on public.automation_rules, public.automation_runs from anon;

-- One pass over every active rule. Old things are not dug up: only what became due in the last 30 days.
-- Returns how many tasks it made. Safe to run any number of times (the unique key on automation_runs).
create or replace function public.run_rules() returns integer
language plpgsql security definer set search_path = public as $$
declare
  n integer := 0;
  d integer;
  r record;
  tid uuid;
begin
  if auth.uid() is not null and not public.is_staff() then raise exception 'Staff only.' using errcode = '42501'; end if;

  -- 1. A website enquiry nobody has answered.
  select days into d from automation_rules where id = 'enquiry_unanswered' and active;
  if found then
    for r in select c.id, c.name, c.company from contact_requests c
      where c.status = 'new' and c.created_at < now() - make_interval(days => greatest(d, 0)) and c.created_at > now() - interval '30 days'
        and not exists (select 1 from automation_runs x where x.rule_id = 'enquiry_unanswered' and x.object_id = c.id)
    loop
      insert into tasks (title, kind, due_on, request_id, rule_id, created_by)
        values (left('Reply to the enquiry from ' || coalesce(nullif(trim(r.name), ''), 'the website') || coalesce(', ' || nullif(trim(r.company), ''), ''), 300), 'email', current_date, r.id, 'enquiry_unanswered', null)
        returning id into tid;
      insert into automation_runs (rule_id, object_id, task_id) values ('enquiry_unanswered', r.id, tid);
      n := n + 1;
    end loop;
  end if;

  -- 2. The client has had the ball for d days and nobody is chasing it.
  select days into d from automation_rules where id = 'client_silent' and active;
  if found then
    for r in select p.id, p.assignee_id, p.stage_changed_at from projects p left join project_internal i on i.project_id = p.id
      where p.stage in ('clarification', 'quote_issued', 'drawings') and i.waiting_on is null
        and p.stage_changed_at < now() - make_interval(days => greatest(d, 1)) and p.stage_changed_at > now() - interval '60 days'
        and not exists (select 1 from automation_runs x where x.rule_id = 'client_silent' and x.object_id = p.id and x.cycle = p.stage_changed_at::date::text)
    loop
      insert into tasks (title, kind, due_on, project_id, assignee_id, rule_id, created_by)
        values ('Chase the client: no answer for ' || d || ' days', 'call', current_date, r.id, r.assignee_id, 'client_silent', null)
        returning id into tid;
      insert into automation_runs (rule_id, object_id, cycle, task_id) values ('client_silent', r.id, r.stage_changed_at::date::text, tid);
      n := n + 1;
    end loop;
  end if;

  -- 3. The chase date set under "Waiting on" has come.
  select days into d from automation_rules where id = 'chase_date' and active;
  if found then
    for r in select p.id, p.assignee_id, i.chase_on, i.waiting_on from projects p join project_internal i on i.project_id = p.id
      where i.waiting_on is not null and i.chase_on is not null and i.chase_on <= current_date and i.chase_on > current_date - 30
        and p.stage not in ('completed', 'closed', 'on_hold')
        and not exists (select 1 from automation_runs x where x.rule_id = 'chase_date' and x.object_id = p.id and x.cycle = r_cycle(i.chase_on))
    loop
      insert into tasks (title, kind, due_on, project_id, assignee_id, rule_id, created_by)
        values ('Chase ' || case r.waiting_on when 'client' then 'the client' when 'supplier' then 'the supplier' when 'subcontractor' then 'the subcontractor' else 'them' end, 'call', r.chase_on, r.id, r.assignee_id, 'chase_date', null)
        returning id into tid;
      insert into automation_runs (rule_id, object_id, cycle, task_id) values ('chase_date', r.id, r_cycle(r.chase_on), tid);
      n := n + 1;
    end loop;
  end if;

  -- 4. A survey, delivery or fitting is d days away: confirm it with the client and the crew.
  select days into d from automation_rules where id = 'booking_confirm' and active;
  if found then
    for r in select b.id, b.kind, b.starts_on, b.project_id, coalesce(b.staff_id, p.assignee_id) as who from project_bookings b join projects p on p.id = b.project_id
      where b.kind in ('survey', 'delivery', 'install') and b.starts_on between current_date and current_date + greatest(d, 0)
        and not exists (select 1 from automation_runs x where x.rule_id = 'booking_confirm' and x.object_id = b.id and x.cycle = r_cycle(b.starts_on))
    loop
      insert into tasks (title, kind, due_on, project_id, assignee_id, rule_id, created_by)
        values ('Confirm the ' || case r.kind when 'install' then 'fitting' else r.kind end || ' on ' || to_char(r.starts_on, 'DD Mon') || ' with the client and the crew', 'call', greatest(current_date, r.starts_on - 1), r.project_id, r.who, 'booking_confirm', null)
        returning id into tid;
      insert into automation_runs (rule_id, object_id, cycle, task_id) values ('booking_confirm', r.id, r_cycle(r.starts_on), tid);
      n := n + 1;
    end loop;
  end if;

  -- 5. A payment is d days late: a person writes the reminder (nothing is emailed by itself).
  select days into d from automation_rules where id = 'payment_late' and active;
  if found then
    for r in select y.id, y.label, y.project_id, p.assignee_id from payments y join projects p on p.id = y.project_id
      where y.paid_at is null and y.due_date is not null and y.due_date < now() - make_interval(days => greatest(d, 0)) and y.due_date > now() - interval '60 days'
        and not exists (select 1 from automation_runs x where x.rule_id = 'payment_late' and x.object_id = y.id)
    loop
      insert into tasks (title, kind, due_on, project_id, assignee_id, rule_id, created_by)
        values (left('Payment reminder: ' || r.label, 300), 'email', current_date, r.project_id, r.assignee_id, 'payment_late', null)
        returning id into tid;
      insert into automation_runs (rule_id, object_id, task_id) values ('payment_late', r.id, tid);
      n := n + 1;
    end loop;
  end if;

  return n;
end $$;

-- The cycle key of a dated rule: the date as text (one task per date, a new date makes a new task).
create or replace function public.r_cycle(d date) returns text language sql immutable as $$ select d::text $$;

revoke execute on function public.run_rules() from public, anon;
grant execute on function public.run_rules() to authenticated;
