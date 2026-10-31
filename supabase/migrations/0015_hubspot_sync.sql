-- HubSpot CRM sync (supabase/functions/_shared/hubspot.ts): contact-submit copies each new enquiry to HubSpot
-- in the background and records the result here. RLS and my_enquiries() stay as they are.
alter table public.contact_requests
  add column if not exists hubspot_contact_id text,
  add column if not exists hubspot_deal_id text,
  add column if not exists hubspot_synced_at timestamptz,
  add column if not exists hubspot_error text;
