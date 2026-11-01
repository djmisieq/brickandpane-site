-- Retries for the HubSpot sync (supabase/functions/_shared/hubspot.ts). syncEnquiry counts every attempt;
-- the hubspot-retry Edge Function, called by pg_cron every 15 minutes, repeats failed ones with a backoff and
-- emails the team once after the last failure (hubspot_alerted_at). RLS stays as it is (staff and service role only).
-- Not part of tests/db (pglite has no pg_cron or pg_net).

alter table public.contact_requests
  add column if not exists hubspot_attempts int not null default 0,
  add column if not exists hubspot_attempted_at timestamptz,
  add column if not exists hubspot_alerted_at timestamptz;

create index if not exists contact_requests_hubspot_pending on public.contact_requests (created_at)
  where hubspot_deal_id is null and hubspot_alerted_at is null;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- Same name = the job is replaced, so re-running this is safe. The function only acts on rows that are due.
select cron.schedule('hubspot-retry', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/hubspot-retry',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);
