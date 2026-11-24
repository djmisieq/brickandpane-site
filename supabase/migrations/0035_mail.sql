-- Mail in the CRM, stage 1a: READ ONLY (plan: brickandpane-docs/docs/PLAN-WLASNY-CRM.md, owner's consent 24.11.2026).
-- supabase/functions/mail-sync reads the OVH Zimbra mailboxes over IMAP (EXAMINE + BODY.PEEK: nothing is deleted,
-- moved or marked read) and keeps a copy here, so a client's mail shows on their project in the CRM.
--   contact@  everything except Junk/Trash (the address on the website: enquiries come from strangers)
--   chris@, kate@  ONLY mail to or from a known client or supplier; anything else is never downloaded (headers are
--                  checked first, the body is fetched only for a match), so private mail stays out of the CRM.
-- STAFF ONLY. A client never reads mail here, not even their own. Purely additive: new tables and functions only.

create table public.mail_accounts (
  id uuid primary key default gen_random_uuid(),
  address text unique not null,
  mode text not null check (mode in ('all', 'known')),
  folders text[] not null default '{INBOX,Sent}',
  since date not null default (current_date - 90),   -- how far back the first run reads
  enabled boolean not null default true,
  last_run_at timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
-- The password of each is the function's secret MAIL_PASSWORD_<NAME> (MAIL_PASSWORD_CONTACT, …), set by the owner.
insert into public.mail_accounts (address, mode) values
  ('contact@brickandpane.co.uk', 'all'), ('chris@brickandpane.co.uk', 'known'), ('kate@brickandpane.co.uk', 'known')
on conflict (address) do nothing;

create table public.mail_folder_state (
  account_id uuid references public.mail_accounts (id) on delete cascade,
  folder text not null,
  uidvalidity bigint not null,
  last_uid bigint not null default 0,
  primary key (account_id, folder)
);

-- Addresses or whole domains ("@okna.pl") the team marks as known: a supplier, or a client the CRM has no account or
-- enquiry for. With a project, their mail shows on that project.
create table public.mail_contacts (
  id uuid primary key default gen_random_uuid(),
  match text unique not null check (match = lower(match) and match ~ '^([^@\s]+)?@[^@\s]+\.[^@\s]+$'),
  kind text not null default 'supplier' check (kind in ('client', 'supplier', 'other')),
  label text not null default '' check (length(label) <= 120),
  project_id uuid references public.projects (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.mail_messages (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.mail_accounts (id) on delete cascade,
  folder text not null,
  uidvalidity bigint not null,
  uid bigint not null,
  message_id text,
  in_reply_to text,
  refs text not null default '',
  direction text not null check (direction in ('in', 'out')),
  from_addr text not null default '',
  from_name text not null default '',
  to_addrs text[] not null default '{}',
  cc_addrs text[] not null default '{}',
  subject text not null default '',
  sent_at timestamptz,
  body_text text not null default '',
  attachments jsonb not null default '[]',   -- [{name, type, size, path|null}]; path is in the private bucket mail-files
  too_large boolean not null default false,  -- over the size the sync downloads: open it in Zimbra
  project_id uuid references public.projects (id) on delete set null,  -- set by hand in the CRM; else matched by address
  dismissed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (account_id, folder, uidvalidity, uid)
);
-- The same mail in two mailboxes (contact@ Inbox and kate@ Sent, a copy to chris@) is kept once.
create unique index mail_messages_message_id on public.mail_messages (message_id) where message_id is not null;
create index mail_messages_sent on public.mail_messages (sent_at desc);
create index mail_messages_from on public.mail_messages (from_addr);
create index mail_messages_to on public.mail_messages using gin (to_addrs);
create index mail_messages_cc on public.mail_messages using gin (cc_addrs);

alter table public.mail_accounts enable row level security;
alter table public.mail_folder_state enable row level security;
alter table public.mail_contacts enable row level security;
alter table public.mail_messages enable row level security;
revoke all on public.mail_accounts, public.mail_folder_state, public.mail_contacts, public.mail_messages from anon, authenticated;
create policy "mail accounts staff read" on public.mail_accounts for select to authenticated using (public.is_staff());
grant select on public.mail_accounts to authenticated;
create policy "mail contacts staff read" on public.mail_contacts for select to authenticated using (public.is_staff());
create policy "mail contacts staff insert" on public.mail_contacts for insert to authenticated with check (public.is_staff());
create policy "mail contacts staff update" on public.mail_contacts for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "mail contacts staff delete" on public.mail_contacts for delete to authenticated using (public.is_staff());
grant select, delete on public.mail_contacts to authenticated;
grant insert (match, kind, label, project_id) on public.mail_contacts to authenticated;
grant update (kind, label, project_id) on public.mail_contacts to authenticated;
create policy "mail staff read" on public.mail_messages for select to authenticated using (public.is_staff());
create policy "mail staff update" on public.mail_messages for update to authenticated using (public.is_staff()) with check (public.is_staff());
grant select on public.mail_messages to authenticated;
grant update (project_id, dismissed) on public.mail_messages to authenticated;
-- mail_folder_state: the sync's alone (service role), no grants.

-- Every address the CRM knows, with its project where there is one: a client's account on the project, an
-- invitation, the enquiry it came from, a contact the team added. Staff addresses never count as a client.
create or replace function public.mail_project_addresses() returns table (addr text, project_id uuid, kind text)
language sql stable security definer set search_path = public as $$
  select lower(u.email), m.project_id, 'client' from public.project_members m
    join public.profiles p on p.id = m.user_id and p.role <> 'staff' join auth.users u on u.id = m.user_id
  union select lower(i.email), i.project_id, 'client' from public.project_invites i
  union select lower(r.email), r.project_id, 'client' from public.contact_requests r where r.status <> 'spam'
  union select c.match, c.project_id, c.kind from public.mail_contacts c
$$;
revoke execute on function public.mail_project_addresses() from public, anon, authenticated;

-- The CRM's list: recent mail with the projects it belongs to (set by hand, else by address). Staff only.
create or replace function public.mail_list(pid uuid default null, unassigned boolean default false, lim int default 100)
returns table (id uuid, account text, folder text, direction text, from_addr text, from_name text, to_addrs text[],
               cc_addrs text[], subject text, sent_at timestamptz, body_text text, attachments jsonb, too_large boolean,
               message_id text, in_reply_to text, dismissed boolean, manual_project uuid, projects uuid[])
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  return query
  with k as (select * from public.mail_project_addresses() where project_id is not null),
  m as (
    select mm.*, a.address,
      case when mm.project_id is not null then array[mm.project_id] else
        array(select distinct k.project_id from k
              where k.addr = any (array[lower(mm.from_addr)] || mm.to_addrs || mm.cc_addrs)
                 or (k.addr like '@%' and exists (select 1 from unnest(array[lower(mm.from_addr)] || mm.to_addrs || mm.cc_addrs) x where x like '%' || k.addr)))
      end as pids
    from public.mail_messages mm join public.mail_accounts a on a.id = mm.account_id
  )
  select m.id, m.address, m.folder, m.direction, m.from_addr, m.from_name, m.to_addrs, m.cc_addrs, m.subject, m.sent_at,
         m.body_text, m.attachments, m.too_large, m.message_id, m.in_reply_to, m.dismissed, m.project_id, m.pids
  from m
  where (pid is null or pid = any (m.pids))
    and (not unassigned or (cardinality(m.pids) = 0 and not m.dismissed))
  order by m.sent_at desc nulls last
  limit least(greatest(lim, 1), 500);
end $$;
revoke execute on function public.mail_list(uuid, boolean, int) from public, anon;
grant execute on function public.mail_list(uuid, boolean, int) to authenticated;

-- Attachments: private bucket, staff read; only the sync writes.
insert into storage.buckets (id, name, public, file_size_limit)
values ('mail-files', 'mail-files', false, 10485760)
on conflict (id) do nothing;
drop policy if exists "mail files staff read" on storage.objects;
create policy "mail files staff read" on storage.objects for select using (bucket_id = 'mail-files' and public.is_staff());
