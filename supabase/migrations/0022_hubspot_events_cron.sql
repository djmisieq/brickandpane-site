-- Every 15 minutes, turn queued portal events into notes on HubSpot deals (supabase/functions/hubspot-events).
-- Same name = the job is replaced, so re-running this is safe. Not part of tests/db (pglite has no pg_cron).

select cron.schedule('hubspot-events', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/hubspot-events',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);
