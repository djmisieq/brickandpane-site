-- Excel audit 28.11.2026: the CRM's sheets. Additive only: new columns, two new tables, triggers.
-- 1. Saved views of a sheet (filters, sort, which columns): shared with the team or one's own. Staff only.
-- 2. Openings become a schedule the team edits like Excel: an order, who changed it and when, every change in
--    the CRM log, and live updates for a second person. Existing openings keep their values; only the new
--    "sort" column is filled once, from the reference.

create table if not exists public.crm_views (
  id uuid primary key default gen_random_uuid(),
  table_key text not null check (table_key in ('projects', 'companies', 'people', 'tasks', 'openings')),
  name text not null check (length(trim(name)) between 1 and 80),
  state jsonb not null check (jsonb_typeof(state) = 'object' and pg_column_size(state) <= 32768),
  shared boolean not null default true,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.crm_views enable row level security;
drop policy if exists "views staff read" on public.crm_views;
create policy "views staff read" on public.crm_views for select to authenticated using (public.is_staff() and (shared or owner_id = auth.uid()));
drop policy if exists "views staff insert" on public.crm_views;
create policy "views staff insert" on public.crm_views for insert to authenticated with check (public.is_staff() and owner_id = auth.uid());
drop policy if exists "views staff update" on public.crm_views;
create policy "views staff update" on public.crm_views for update to authenticated using (public.is_staff() and (shared or owner_id = auth.uid())) with check (public.is_staff());
drop policy if exists "views staff delete" on public.crm_views;
create policy "views staff delete" on public.crm_views for delete to authenticated using (public.is_staff() and owner_id = auth.uid());
revoke all on public.crm_views from anon;

alter table public.openings
  add column if not exists sort integer not null default 0,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists updated_by uuid references public.profiles (id) on delete set null;

-- The order a schedule is read in: by reference within each project (only the new column is written).
with o as (select id, row_number() over (partition by project_id order by ref, id) as n from public.openings)
update public.openings x set sort = o.n from o where o.id = x.id and x.sort = 0;

create or replace function public.openings_touch() returns trigger language plpgsql set search_path = public as $$
begin new.updated_at := now(); new.updated_by := auth.uid(); return new; end $$;
drop trigger if exists openings_touch on public.openings;
create trigger openings_touch before update on public.openings for each row execute function public.openings_touch();

do $$ begin
  drop trigger if exists crm_log_openings on public.openings;
  create trigger crm_log_openings after insert or update or delete on public.openings for each row
    execute function public.crm_log_change('project_id', 'opening', 'id', 'ref', 'system', 'material', 'width_mm', 'height_mm', 'config', 'glazing', 'qty', 'notes');
end $$;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'openings') then
    alter publication supabase_realtime add table public.openings;
  end if;
end $$;
