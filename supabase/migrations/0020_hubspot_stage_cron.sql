-- Every 15 minutes, copy changed HubSpot deal stages to linked projects (supabase/functions/hubspot-stage-sync).
-- Same name = the job is replaced, so re-running this is safe. Not part of tests/db (pglite has no pg_cron).

select cron.schedule('hubspot-stage-sync', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/hubspot-stage-sync',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);
