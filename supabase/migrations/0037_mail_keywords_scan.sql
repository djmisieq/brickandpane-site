-- Mail in the CRM, after the first tidy-up (owner, 24.11.2026). Additive: two new tables, mail_list() extended.
--  1. Keywords per project: mail whose SUBJECT names the site ("Avon Run", "Lawford Court") shows on that project.
--     For a client with several sites on one domain (Kingsgate), where the address alone cannot say which job it is.
--  2. A one-off review of chris@ / kate@ HEADERS (sender, recipients, subject, date; never the body) of mail from
--     people the CRM does not know, to find enquiries it missed. Filled by mail-sync on request, read by the team,
--     emptied after the review.

create table public.mail_keywords (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  keyword text not null check (length(trim(keyword)) between 3 and 80),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index mail_keywords_unique on public.mail_keywords (project_id, lower(keyword));
alter table public.mail_keywords enable row level security;
revoke all on public.mail_keywords from anon, authenticated;
create policy "mail keywords staff read" on public.mail_keywords for select to authenticated using (public.is_staff());
create policy "mail keywords staff insert" on public.mail_keywords for insert to authenticated with check (public.is_staff());
create policy "mail keywords staff delete" on public.mail_keywords for delete to authenticated using (public.is_staff());
grant select, delete on public.mail_keywords to authenticated;
grant insert (project_id, keyword) on public.mail_keywords to authenticated;

create table public.mail_header_scan (
  account text not null,
  folder text not null,
  uid bigint not null,
  from_addr text not null default '',
  from_name text not null default '',
  to_addrs text[] not null default '{}',
  subject text not null default '',
  sent_at timestamptz,
  scanned_at timestamptz not null default now(),
  primary key (account, folder, uid)
);
alter table public.mail_header_scan enable row level security;
revoke all on public.mail_header_scan from anon, authenticated;
create policy "mail header scan staff read" on public.mail_header_scan for select to authenticated using (public.is_staff());
create policy "mail header scan staff delete" on public.mail_header_scan for delete to authenticated using (public.is_staff());
grant select, delete on public.mail_header_scan to authenticated;

-- mail_list as in 0035, plus: a keyword of a project found in the subject puts the mail on that project.
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
        array(select distinct x.pid from (
          select k.project_id as pid from k
           where k.addr = any (array[lower(mm.from_addr)] || mm.to_addrs || mm.cc_addrs)
              or (k.addr like '@%' and exists (select 1 from unnest(array[lower(mm.from_addr)] || mm.to_addrs || mm.cc_addrs) y where y like '%' || k.addr))
          union
          select w.project_id from public.mail_keywords w where position(lower(w.keyword) in lower(mm.subject)) > 0
        ) x)
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
