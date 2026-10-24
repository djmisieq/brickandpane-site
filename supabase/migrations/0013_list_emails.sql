-- "Email me this list" (24.10.2026): the list-email function sends a visitor their list of openings.
-- Only hashes are kept, for the sending limits; rows older than a day are deleted by the function.
-- No policies: only the function (service role) reads and writes.

create table public.list_emails (
  id bigint generated always as identity primary key,
  email_hash text not null,
  ip_hash text not null,
  created_at timestamptz not null default now()
);
create index list_emails_created on public.list_emails (created_at);

alter table public.list_emails enable row level security;
revoke all on public.list_emails from anon, authenticated;
