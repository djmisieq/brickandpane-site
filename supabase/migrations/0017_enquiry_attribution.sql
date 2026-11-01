-- Where an enquiry came from: campaign tags and the first page of the visit, captured in the browser's
-- sessionStorage (no cookies, js/main.js) and sent with the form. contact-submit stores them; the HubSpot sync
-- copies them to the deal (bp_utm_*, bp_landing_page). RLS stays as it is (staff and service role only).

alter table public.contact_requests
  add column if not exists utm_source text,
  add column if not exists utm_medium text,
  add column if not exists utm_campaign text,
  add column if not exists landing_page text;
