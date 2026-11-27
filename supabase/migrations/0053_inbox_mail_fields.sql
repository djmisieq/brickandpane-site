-- UX audit 27.11.2026, stage U3. Additive only: new columns and one new table; nothing existing is changed or deleted.
-- 1. Inbox: a notification can be put off until later (it comes back on its own at that time).
-- 2. Email: the team marks an incoming email as dealt with, so "email came in, our move" stops nagging. CRM-side
--    only: nothing is written back to the mailbox (IMAP stays read only).
-- 3. Project fields of the team's own (system, RAL colour, crew…): their definitions, and their values per project.

alter table public.notifications add column if not exists snooze_until timestamptz;

alter table public.mail_messages
  add column if not exists handled_at timestamptz,
  add column if not exists handled_by uuid references public.profiles (id) on delete set null;
grant update (handled_at, handled_by) on public.mail_messages to authenticated;

create table if not exists public.project_fields (
  key text primary key check (key ~ '^[a-z][a-z0-9_]{1,39}$'),
  label text not null check (length(trim(label)) between 1 and 60),
  kind text not null default 'text' check (kind in ('text', 'select', 'date', 'number')),
  options text[] not null default '{}',
  sort integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.project_fields enable row level security;
drop policy if exists "project fields staff" on public.project_fields;
create policy "project fields staff" on public.project_fields for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.project_fields from anon;

-- Values live with the other staff-only facts of a project (never shown to the client).
alter table public.project_internal add column if not exists custom jsonb not null default '{}'::jsonb;
