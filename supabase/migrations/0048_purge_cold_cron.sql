-- Daily at 03:15 UTC: the cold-list deletion of 0047 (UK GDPR, 12 months without contact). Not in the pglite tests
-- (pg_cron), like the other cron migrations.
select cron.unschedule(jobname) from cron.job where jobname = 'purge-cold-prospects';
select cron.schedule('purge-cold-prospects', '15 3 * * *', $$ select public.purge_cold_prospects(); $$);
