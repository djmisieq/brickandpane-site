-- Costs ↔ HubSpot, stage 2 (plan: brickandpane-docs/docs/PLAN-KOSZTY.md). Each supplier quote on a project whose
-- project has a client deal becomes a deal in the "Purchasing" pipeline, associated with that client deal; the stage
-- and the CRM status follow each other. Lead bot set up the pipeline and properties on 11.11.2026.
-- supabase/functions/hubspot-costs does the work every 15 minutes; these columns are its alone (staff grants in 0031
-- do not include them).

alter table public.supplier_quotes
  add column if not exists hubspot_status text,   -- the CRM status last written to / read from HubSpot
  add column if not exists hubspot_stage text,    -- the deal stage last seen
  add column if not exists hubspot_note_id text,  -- the note with the supplier's PDF
  add column if not exists hubspot_attempts int not null default 0;

-- updated_at means "the team changed something HubSpot should know": the sync writing its own columns must not
-- count, or every run would mark the row changed again.
create or replace function public.supplier_quotes_touch() returns trigger
language plpgsql set search_path = public as $$
begin
  if (new.supplier, new.reference, new.category, new.amount, new.currency, new.fx_to_gbp, new.status, new.quoted_on,
      new.valid_until, new.pdf_path, new.pdf_name, new.note)
     is distinct from
     (old.supplier, old.reference, old.category, old.amount, old.currency, old.fx_to_gbp, old.status, old.quoted_on,
      old.valid_until, old.pdf_path, old.pdf_name, old.note) then
    new.updated_at := now();
  else
    new.updated_at := old.updated_at;
  end if;
  return new;
end $$;

-- Rows HubSpot does not know yet, or that changed since; a deal for the project is needed (it is the sale to link to).
create index if not exists supplier_quotes_hubspot on public.supplier_quotes (project_id) where hubspot_deal_id is not null;
