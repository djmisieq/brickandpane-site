-- Every 5 minutes: copy new mail from the Zimbra mailboxes into the CRM (supabase/functions/mail-sync, READ ONLY).
-- Same name = the job is replaced, so re-running this is safe. Not part of tests/db (pglite has no pg_cron).

select cron.schedule('mail-sync', '*/5 * * * *', $$
  select net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/mail-sync',
    body := '{}'::jsonb,
    headers := '{"Content-Type": "application/json"}'::jsonb
  )
$$);
