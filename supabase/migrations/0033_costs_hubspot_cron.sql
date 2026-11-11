-- Every 15 minutes: supplier quotes ↔ the HubSpot "Purchasing" pipeline (supabase/functions/hubspot-costs).
-- Same name = the job is replaced, so re-running this is safe. Not part of tests/db (pglite has no pg_cron).

select cron.schedule('hubspot-costs', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/hubspot-costs',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);
