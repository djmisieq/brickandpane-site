-- HubSpot is being dropped for the company's own CRM (owner, 25.11.2026: "Wyłącz synchronizację z hubspot").
-- Stops the five 15-minute HubSpot jobs (0016, 0020, 0022, 0027, 0033). No data is touched: the hubspot_* columns
-- stay as a record. The secret HUBSPOT=off stops the remaining paths (enquiry form, database triggers, the CRM).
-- To undo: re-run the cron.schedule blocks of those migrations and unset HUBSPOT.
select cron.unschedule(jobname) from cron.job
where jobname in ('hubspot-retry', 'hubspot-stage-sync', 'hubspot-events', 'hubspot-quotes', 'hubspot-costs');
