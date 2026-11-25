-- CRM audit, phase 3: tasks and the conversation log. Who does what by when, on a project or an enquiry, and
-- "log a call + next contact" (a done task with what was said, and the next task with its date). Staff only:
-- clients never see a task. New table only; nothing existing is touched.
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(trim(title)) between 1 and 300),
  kind text not null default 'task' check (kind in ('task', 'call', 'email', 'visit')),
  note text not null default '' check (length(note) <= 4000),
  due_on date,
  assignee_id uuid references public.profiles (id) on delete set null,
  project_id uuid references public.projects (id) on delete cascade,
  request_id uuid references public.contact_requests (id) on delete cascade,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists tasks_open on public.tasks (due_on) where done_at is null;
create index if not exists tasks_project on public.tasks (project_id, created_at desc);
create index if not exists tasks_request on public.tasks (request_id, created_at desc);

alter table public.tasks enable row level security;
drop policy if exists "tasks staff read" on public.tasks;
create policy "tasks staff read" on public.tasks for select to authenticated using (public.is_staff());
drop policy if exists "tasks staff insert" on public.tasks;
create policy "tasks staff insert" on public.tasks for insert to authenticated with check (public.is_staff());
drop policy if exists "tasks staff update" on public.tasks;
create policy "tasks staff update" on public.tasks for update to authenticated using (public.is_staff()) with check (public.is_staff());
drop policy if exists "tasks staff delete" on public.tasks;
create policy "tasks staff delete" on public.tasks for delete to authenticated using (public.is_staff());
revoke all on public.tasks from anon, authenticated;
grant select, delete on public.tasks to authenticated;
grant insert (title, kind, note, due_on, assignee_id, project_id, request_id, done_at, done_by) on public.tasks to authenticated;
grant update (title, kind, note, due_on, assignee_id, done_at, done_by) on public.tasks to authenticated;

create or replace function public.tasks_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists tasks_touch on public.tasks;
create trigger tasks_touch before update on public.tasks for each row execute function public.tasks_touch();
