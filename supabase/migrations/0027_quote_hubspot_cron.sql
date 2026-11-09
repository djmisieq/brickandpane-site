-- Every 15 minutes: send quotes the button could not get to HubSpot, and take quote statuses from deal stages
-- (supabase/functions/hubspot-quotes, action "sync"). Same name = the job is replaced, so re-running this is safe.
-- Not part of tests/db (pglite has no pg_cron).

select cron.schedule('hubspot-quotes', '*/15 * * * *', $$
  select net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/hubspot-quotes',
    body := '{"action":"sync"}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);
