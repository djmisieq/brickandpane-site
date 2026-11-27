-- Every 15 minutes: run the automation rules (0051). Same name = the job is replaced, so re-running this is safe.
-- Not part of tests/db (pglite has no pg_cron). Switch a rule off in the CRM (#/automations), not here.
select cron.schedule('run-rules', '*/15 * * * *', $$ select public.run_rules() $$);
