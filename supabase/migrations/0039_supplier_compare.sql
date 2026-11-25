-- Comparing supplier quotes on a project (supplier-mail review, brickandpane-docs/docs/KREATOR-WYCEN-ANALIZA-2026-11-25.md).
-- The team asks 2–7 suppliers per job and every one prices differently: VAT in the price or not, delivery included or
-- extra, a discount, a lead time, an alternative system. These columns let the CRM put them side by side like for
-- like, and "requested" keeps the suppliers still to answer ("waiting since").
-- Additive only: existing rows keep their numbers (no VAT in, no delivery, no discount → net_gbp = amount × rate).

alter table public.supplier_quotes
  add column if not exists vat_in_pct numeric(5, 2) not null default 0 check (vat_in_pct between 0 and 30), -- VAT inside the amount, e.g. 20 or 23; 0 = net
  add column if not exists delivery_gbp numeric(12, 2) not null default 0 check (delivery_gbp >= 0),     -- delivery charged on top, net £
  add column if not exists discount_pct numeric(5, 2) not null default 0 check (discount_pct between 0 and 100),
  add column if not exists lead_days int check (lead_days between 0 and 365),                            -- from the signed order
  add column if not exists variant text not null default '' check (length(variant) <= 120),              -- "Aluprof MB-86", "triple glazed"
  add column if not exists requested_on date;                                                            -- when we asked

-- What the quote costs us, net of VAT, after the discount, with delivery: the number the comparison and the margin use.
alter table public.supplier_quotes add column if not exists net_gbp numeric(12, 2)
  generated always as (round(amount * fx_to_gbp / (1 + vat_in_pct / 100) * (1 - discount_pct / 100) + delivery_gbp, 2)) stored;

-- "Requested": asked, no price yet. HubSpot's Purchasing pipeline already has that stage.
alter table public.supplier_quotes drop constraint if exists supplier_quotes_status_check;
alter table public.supplier_quotes add constraint supplier_quotes_status_check
  check (status in ('requested', 'received', 'accepted', 'rejected', 'superseded'));

grant insert (vat_in_pct, delivery_gbp, discount_pct, lead_days, variant, requested_on) on public.supplier_quotes to authenticated;
grant update (vat_in_pct, delivery_gbp, discount_pct, lead_days, variant, requested_on) on public.supplier_quotes to authenticated;

-- Team edits bump updated_at (0032, 0034); the new columns change what HubSpot shows, so they count as edits too.
create or replace function public.supplier_quotes_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := now();
    if new.hubspot_synced_at is not null then new.hubspot_synced_at := new.updated_at; end if; -- imported from HubSpot
    return new;
  end if;
  if (new.supplier, new.reference, new.category, new.amount, new.currency, new.fx_to_gbp, new.status, new.quoted_on,
      new.valid_until, new.pdf_path, new.pdf_name, new.note,
      new.vat_in_pct, new.delivery_gbp, new.discount_pct, new.lead_days, new.variant, new.requested_on)
     is distinct from
     (old.supplier, old.reference, old.category, old.amount, old.currency, old.fx_to_gbp, old.status, old.quoted_on,
      old.valid_until, old.pdf_path, old.pdf_name, old.note,
      old.vat_in_pct, old.delivery_gbp, old.discount_pct, old.lead_days, old.variant, old.requested_on) then
    new.updated_at := now();
    if new.hubspot_synced_at is distinct from old.hubspot_synced_at then new.hubspot_synced_at := new.updated_at; end if;
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

-- The margin (0031, 0038) now counts each accepted quote at its comparable net cost.
create or replace function public.project_margin(pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare deal text; sale numeric; src text; refs text; cost numeric; n int;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select hubspot_deal_id into deal from public.project_internal where project_id = pid;
  with last as (
    select distinct on (s.quote_id) s.quote_id, s.reference, s.total / (1 + s.vat_rate / 100) as net
    from public.quote_sends s join public.quotes q on q.id = s.quote_id
    where (s.project_id = pid or (deal is not null and s.hubspot_deal_id = deal)) and q.status = 'accepted'
    order by s.quote_id, s.created_at desc)
  select sum(net), string_agg(reference, ', ' order by reference) into sale, refs from last;
  if sale is not null then src := 'accepted'; end if;
  if sale is null then
    select s.total / (1 + s.vat_rate / 100), s.reference into sale, refs
    from public.quote_sends s join public.quotes q on q.id = s.quote_id
    where (s.project_id = pid or (deal is not null and s.hubspot_deal_id = deal)) and q.status <> 'declined'
    order by s.created_at desc limit 1;
    if sale is not null then src := 'sent'; end if;
  end if;
  if sale is null then
    select value_gbp into sale from public.project_internal where project_id = pid;
    if sale is not null then src := 'value'; end if;
  end if;
  select coalesce(sum(net_gbp), 0), count(*) into cost, n
  from public.supplier_quotes where project_id = pid and status = 'accepted';
  return jsonb_build_object(
    'sale_gbp', round(sale, 2), 'sale_source', src, 'sale_refs', refs,
    'cost_gbp', round(cost, 2), 'accepted', n,
    'margin_gbp', case when sale is null then null else round(sale - cost, 2) end,
    'margin_pct', case when sale is null or sale = 0 then null else round((sale - cost) / sale * 100, 1) end);
end $$;
revoke execute on function public.project_margin(uuid) from public, anon;
grant execute on function public.project_margin(uuid) to authenticated;
