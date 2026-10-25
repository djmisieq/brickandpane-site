-- Prospects: architects and companies the team wants to start working with, kept in the staff CRM (admin.html#/prospects).
-- Staff only, like contact_requests: clients and the public never see this table.

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  company text not null check (length(company) between 1 and 200),
  kind text not null default 'architect' check (kind in ('architect', 'developer', 'contractor', 'designer', 'other')),
  stage text not null default 'to_contact' check (stage in ('to_contact', 'contacted', 'talking', 'first_project', 'partner', 'not_now')),
  contact_name text not null default '' check (length(contact_name) <= 200),
  contact_role text not null default '' check (length(contact_role) <= 200),
  email text not null default '' check (email = '' or email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text not null default '' check (length(phone) <= 50),
  website text not null default '' check (website = '' or (website ~* '^https?://' and length(website) <= 500)),
  area text not null default '' check (length(area) <= 200),       -- borough or town
  source text not null default '' check (length(source) <= 200),   -- where we found them
  next_step text not null default '' check (length(next_step) <= 500),
  next_at date,
  owner_id uuid references public.profiles (id) on delete set null,
  notes text not null default '' check (length(notes) <= 10000),
  -- Contact history, newest first: [{ "at": iso, "by": "name", "text": "..." }].
  log jsonb not null default '[]' check (jsonb_typeof(log) = 'array' and pg_column_size(log) <= 200000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index prospects_stage on public.prospects (stage);

create or replace function public.prospects_touch() returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger prospects_touch before update on public.prospects for each row execute function public.prospects_touch();

alter table public.prospects enable row level security;
create policy "prospects staff" on public.prospects for all using (public.is_staff()) with check (public.is_staff());
revoke all on public.prospects from anon;
grant select, insert, update, delete on public.prospects to authenticated;

alter publication supabase_realtime add table public.prospects;
