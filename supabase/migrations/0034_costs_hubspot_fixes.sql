-- Costs ↔ HubSpot, after the live test on 11.11.2026 (supplier quote "Okna Polska (TEST)" on BP-2026-0004).
--  1. The supplier's company: the sync now finds it or makes it, and remembers which one it linked, so deals made
--     before this get their company too.
--  2. "When did HubSpot last see this quote" now runs on the database clock. A status pulled from HubSpot bumped
--     updated_at with the database's now() while hubspot_synced_at carried the function's own, slightly earlier, time,
--     so the next run pushed the same quote back once for nothing.

alter table public.supplier_quotes add column if not exists hubspot_company_id text;

-- Team edits bump updated_at (0032). An update that also sets hubspot_synced_at is the sync pulling a status from
-- HubSpot: HubSpot already has that version, so synced_at is the same instant as updated_at, not "a bit before".
create or replace function public.supplier_quotes_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.updated_at := now();
    if new.hubspot_synced_at is not null then new.hubspot_synced_at := new.updated_at; end if; -- imported from HubSpot
    return new;
  end if;
  if (new.supplier, new.reference, new.category, new.amount, new.currency, new.fx_to_gbp, new.status, new.quoted_on,
      new.valid_until, new.pdf_path, new.pdf_name, new.note)
     is distinct from
     (old.supplier, old.reference, old.category, old.amount, old.currency, old.fx_to_gbp, old.status, old.quoted_on,
      old.valid_until, old.pdf_path, old.pdf_name, old.note) then
    new.updated_at := now();
    if new.hubspot_synced_at is distinct from old.hubspot_synced_at then new.hubspot_synced_at := new.updated_at; end if;
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;
drop trigger if exists supplier_quotes_touch on public.supplier_quotes;
create trigger supplier_quotes_touch before insert or update on public.supplier_quotes
  for each row execute function public.supplier_quotes_touch();
