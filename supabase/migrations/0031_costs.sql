-- Costs: supplier and subcontractor quotes on a project, and the margin against the client's quote (owner decision
-- 11.11.2026, plan in brickandpane-docs/docs/PLAN-KOSZTY.md). STAFF ONLY, like project_internal: a client, architect
-- or anyone else on the project never reads a cost, a supplier or a margin.
-- Stage 1 is the CRM. The hubspot_* columns are for stage 2 (a deal in the "Purchasing" pipeline per supplier quote,
-- associated with the client's deal), written only by the service role.

create table public.supplier_quotes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  supplier text not null check (length(trim(supplier)) between 1 and 120),
  reference text not null default '' check (length(reference) <= 60),
  category text not null default 'production' check (category in ('production', 'transport', 'installation', 'other')),
  amount numeric(12, 2) not null check (amount >= 0),
  currency text not null default 'GBP' check (currency in ('GBP', 'PLN', 'EUR')),
  -- The rate the team uses for this quote, typed in with it; nothing is fetched. GBP is always 1.
  fx_to_gbp numeric(12, 6) not null default 1 check (fx_to_gbp > 0 and (currency <> 'GBP' or fx_to_gbp = 1)),
  status text not null default 'received' check (status in ('received', 'accepted', 'rejected', 'superseded')),
  quoted_on date,
  valid_until date,
  pdf_path text,
  pdf_name text not null default '',
  note text not null default '' check (length(note) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  hubspot_deal_id text,
  hubspot_synced_at timestamptz,
  hubspot_error text
);
create index supplier_quotes_project on public.supplier_quotes (project_id, created_at desc);

alter table public.supplier_quotes enable row level security;
create policy "supplier quotes staff read" on public.supplier_quotes for select to authenticated using (public.is_staff());
create policy "supplier quotes staff insert" on public.supplier_quotes for insert to authenticated with check (public.is_staff());
create policy "supplier quotes staff update" on public.supplier_quotes for update to authenticated using (public.is_staff()) with check (public.is_staff());
create policy "supplier quotes staff delete" on public.supplier_quotes for delete to authenticated using (public.is_staff());
revoke all on public.supplier_quotes from anon, authenticated;
grant select, delete on public.supplier_quotes to authenticated;
-- Staff write what they type; the HubSpot link columns are the sync's alone.
grant insert (project_id, supplier, reference, category, amount, currency, fx_to_gbp, status, quoted_on, valid_until, pdf_path, pdf_name, note)
  on public.supplier_quotes to authenticated;
grant update (supplier, reference, category, amount, currency, fx_to_gbp, status, quoted_on, valid_until, pdf_path, pdf_name, note, updated_at)
  on public.supplier_quotes to authenticated;

create or replace function public.supplier_quotes_touch() returns trigger
language plpgsql set search_path = public as $$
begin new.updated_at := now(); return new; end $$;
drop trigger if exists supplier_quotes_touch on public.supplier_quotes;
create trigger supplier_quotes_touch before update on public.supplier_quotes for each row execute function public.supplier_quotes_touch();

-- Margin for one project, in GBP, ex VAT. The sale is, in this order:
--   1. the accepted quotes on the project's HubSpot deal (latest send of each, net of VAT), summed;
--   2. otherwise the latest quote sent on that deal;
--   3. otherwise the value typed in the CRM's Commercial panel (project_internal.value_gbp).
-- Costs are the accepted supplier quotes, each amount × its own rate.
create or replace function public.project_margin(pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare deal text; sale numeric; src text; refs text; cost numeric; n int;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select hubspot_deal_id into deal from public.project_internal where project_id = pid;
  if deal is not null then
    with last as (
      select distinct on (s.quote_id) s.quote_id, s.reference, s.total / (1 + s.vat_rate / 100) as net
      from public.quote_sends s join public.quotes q on q.id = s.quote_id
      where s.hubspot_deal_id = deal and q.status = 'accepted'
      order by s.quote_id, s.created_at desc)
    select sum(net), string_agg(reference, ', ' order by reference) into sale, refs from last;
    if sale is not null then src := 'accepted'; end if;
    if sale is null then
      select s.total / (1 + s.vat_rate / 100), s.reference into sale, refs
      from public.quote_sends s join public.quotes q on q.id = s.quote_id
      where s.hubspot_deal_id = deal and q.status <> 'declined'
      order by s.created_at desc limit 1;
      if sale is not null then src := 'sent'; end if;
    end if;
  end if;
  if sale is null then
    select value_gbp into sale from public.project_internal where project_id = pid;
    if sale is not null then src := 'value'; end if;
  end if;
  select coalesce(sum(amount * fx_to_gbp), 0), count(*) into cost, n
  from public.supplier_quotes where project_id = pid and status = 'accepted';
  return jsonb_build_object(
    'sale_gbp', round(sale, 2), 'sale_source', src, 'sale_refs', refs,
    'cost_gbp', round(cost, 2), 'accepted', n,
    'margin_gbp', case when sale is null then null else round(sale - cost, 2) end,
    'margin_pct', case when sale is null or sale = 0 then null else round((sale - cost) / sale * 100, 1) end);
end $$;
revoke execute on function public.project_margin(uuid) from public, anon;
grant execute on function public.project_margin(uuid) to authenticated;

-- Supplier quote PDFs: private bucket, staff only, PDF only, 10 MB. Path: <project id>/<uuid>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('supplier-quotes', 'supplier-quotes', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "supplier quotes staff read" on storage.objects;
create policy "supplier quotes staff read" on storage.objects for select using (bucket_id = 'supplier-quotes' and public.is_staff());
drop policy if exists "supplier quotes staff upload" on storage.objects;
create policy "supplier quotes staff upload" on storage.objects for insert with check (bucket_id = 'supplier-quotes' and public.is_staff());
