-- HubSpot is off (0040, owner 25.11.2026): a project's stage is set in the CRM again, for every project.
-- 0019 blocked a stage change by staff on a project linked to a HubSpot deal, because the deal owned the stage; with
-- the sync stopped such projects could no longer move. The trigger goes; the function stays for the record.
-- No data is touched.
drop trigger if exists stage_events_guard_linked on public.stage_events;
