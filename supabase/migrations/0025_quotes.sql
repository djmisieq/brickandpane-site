-- Quote builder in the CRM (admin.html#/quotes, 06.11.2026): staff draft, price and print estimates for clients.
-- A copy of the team's offer desk built in Grok, which kept quotes in one browser only; here the whole team shares them.
-- Each quote is one JSON document written by js/portal/quotes.js; `reference` is copied out for searching.
-- Staff only: clients never read this table (they get the printed estimate, or a PDF the team shares in Documents).

create table public.quotes (
  id uuid primary key,
  reference text not null default '',
  data jsonb not null check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 262144),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index quotes_updated_at on public.quotes (updated_at desc);

alter table public.quotes enable row level security;
create policy "quotes staff read" on public.quotes for select to authenticated using (public.is_staff());
create policy "quotes staff insert" on public.quotes for insert to authenticated with check (public.is_staff());
create policy "quotes staff update" on public.quotes for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "quotes staff delete" on public.quotes for delete to authenticated using (public.is_staff());
revoke all on public.quotes from anon;
grant select, insert, update, delete on public.quotes to authenticated;

-- Company and bank details printed on every quote (one row).
create table public.quote_settings (
  id boolean primary key default true check (id),
  data jsonb not null default '{}'::jsonb check (jsonb_typeof(data) = 'object' and pg_column_size(data) <= 16384),
  updated_at timestamptz not null default now()
);

alter table public.quote_settings enable row level security;
create policy "quote settings staff read" on public.quote_settings for select to authenticated using (public.is_staff());
create policy "quote settings staff insert" on public.quote_settings for insert to authenticated with check (public.is_staff());
create policy "quote settings staff update" on public.quote_settings for update to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.quote_settings from anon;
grant select, insert, update on public.quote_settings to authenticated;
