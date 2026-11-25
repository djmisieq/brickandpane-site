-- CRM audit, phase 5 (owner 25.11.2026: our own CRM instead of HubSpot): companies and people as records.
-- An architect's practice, a contractor, a developer or a supplier is a company; the people in it are people; a
-- project links the companies it works with, each in a role. Staff only. New tables only, filled once from the
-- portal accounts (client profiles and their projects) so the list is not empty on day one; nothing existing changes.

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 200),
  kind text not null default 'other' check (kind in ('architect', 'contractor', 'developer', 'supplier', 'homeowner', 'other')),
  website text not null default '' check (length(website) <= 300),
  email text not null default '' check (length(email) <= 200),
  phone text not null default '' check (length(phone) <= 60),
  address text not null default '' check (length(address) <= 500),
  notes text not null default '' check (length(notes) <= 4000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists companies_name_kind on public.companies (lower(trim(name)), kind);

create table if not exists public.people (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies (id) on delete set null,
  full_name text not null check (length(trim(full_name)) between 1 and 200),
  job_title text not null default '' check (length(job_title) <= 120),
  email text not null default '' check (length(email) <= 200),
  phone text not null default '' check (length(phone) <= 60),
  notes text not null default '' check (length(notes) <= 4000),
  profile_id uuid unique references public.profiles (id) on delete set null, -- their portal account, if any
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists people_company on public.people (company_id);

create table if not exists public.project_companies (
  project_id uuid not null references public.projects (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  role text not null default 'client' check (role in ('client', 'architect', 'contractor', 'developer', 'supplier', 'other')),
  created_at timestamptz not null default now(),
  primary key (project_id, company_id, role)
);
create index if not exists project_companies_company on public.project_companies (company_id);

-- A supplier quote can name the supplier's company record (the free-text name stays).
alter table public.supplier_quotes add column if not exists company_id uuid references public.companies (id) on delete set null;
grant insert (company_id), update (company_id) on public.supplier_quotes to authenticated;

do $$ declare t text; begin
  foreach t in array array['companies', 'people', 'project_companies'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s staff" on public.%I', t, t);
    execute format('create policy "%s staff" on public.%I for all to authenticated using (public.is_staff()) with check (public.is_staff())', t, t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;

create or replace function public.crm_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists companies_touch on public.companies;
create trigger companies_touch before update on public.companies for each row execute function public.crm_touch();
drop trigger if exists people_touch on public.people;
create trigger people_touch before update on public.people for each row execute function public.crm_touch();

-- Day one: a company for each client company name typed at sign-up, a person for each client account, and the
-- client link on the projects they own. Runs once; a second run adds nothing.
insert into public.companies (name, kind, created_by)
select distinct on (lower(trim(p.company)), k.kind) trim(p.company), k.kind, null
from public.profiles p
cross join lateral (select case coalesce(p.account_type, '') when 'architect' then 'architect' when 'developer' then 'developer' when 'contractor' then 'contractor' else 'other' end as kind) k
where p.role = 'client' and trim(p.company) <> ''
on conflict do nothing;

insert into public.people (company_id, full_name, email, phone, profile_id)
select (select c.id from public.companies c where lower(trim(c.name)) = lower(trim(p.company)) order by c.created_at limit 1),
       coalesce(nullif(trim(p.full_name), ''), split_part(u.email, '@', 1)), coalesce(u.email, ''), p.phone, p.id
from public.profiles p join auth.users u on u.id = p.id
where p.role = 'client' and not exists (select 1 from public.people x where x.profile_id = p.id);

insert into public.project_companies (project_id, company_id, role)
select distinct m.project_id, x.company_id, 'client'
from public.project_members m join public.people x on x.profile_id = m.user_id
where m.role = 'owner' and x.company_id is not null
on conflict do nothing;
