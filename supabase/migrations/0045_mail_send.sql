-- Mail stage 1b (owner 25.11.2026: "5 ok"): replying from the CRM. Nothing goes out unless a signed-in staff member
-- writes it, ticks that they checked the recipients and the text, and presses Send; the mail-send function checks
-- both. Every attempt is kept here, with who approved it. Staff read it; only the function (service role) writes.
-- The read side stays read-only: nothing is moved, deleted or marked in the mailboxes.
create table if not exists public.mail_outbox (
  id uuid primary key default gen_random_uuid(),
  account text not null,
  to_addrs text[] not null,
  cc_addrs text[] not null default '{}',
  subject text not null default '',
  body_text text not null default '',
  reply_to uuid references public.mail_messages (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  status text not null check (status in ('sent', 'failed')),
  error text,
  message_id text,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists mail_outbox_created on public.mail_outbox (created_at desc);
alter table public.mail_outbox enable row level security;
drop policy if exists "mail outbox staff read" on public.mail_outbox;
create policy "mail outbox staff read" on public.mail_outbox for select to authenticated using (public.is_staff());
revoke all on public.mail_outbox from anon, authenticated;
grant select on public.mail_outbox to authenticated;
