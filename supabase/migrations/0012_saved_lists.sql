-- The list of openings a client builds on the public site, kept on their account (24.10.2026).
-- The browser keeps the working copy (js/openings-list.js); js/account-list.js mirrors it here,
-- so a signed-in client finds the same list on another device. One row per account, no prices.

create table public.saved_lists (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  items jsonb not null default '[]'::jsonb
    check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) <= 100 and pg_column_size(items) <= 65536),
  updated_at timestamptz not null default now()
);

alter table public.saved_lists enable row level security;

create policy "saved list read" on public.saved_lists for select to authenticated using (user_id = auth.uid());
create policy "saved list insert" on public.saved_lists for insert to authenticated with check (user_id = auth.uid());
create policy "saved list update" on public.saved_lists for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "saved list delete" on public.saved_lists for delete to authenticated using (user_id = auth.uid());

revoke all on public.saved_lists from anon;
grant select, insert, update, delete on public.saved_lists to authenticated;
