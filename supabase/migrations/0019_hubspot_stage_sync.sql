-- HubSpot is the only source of a linked project's stage (owner decision 01.11.2026). The hubspot-stage-sync
-- Edge Function (cron in 0020) reads changed deals and moves the project through stage_events, so the usual client
-- notification goes out (stage name only, never a date). Staff can no longer move a linked project by hand;
-- projects without a deal work as before. Runs in tests/db (no pg_net or pg_cron here).

-- Last dealstage copied to the portal: a project only moves when HubSpot's stage changes, not on every run.
alter table public.project_internal add column if not exists hubspot_dealstage text;

-- Cursor for the search by hs_lastmodifieddate. Service role only (RLS on, no policies).
create table if not exists public.hubspot_sync_state (
  key text primary key,
  at timestamptz not null
);
alter table public.hubspot_sync_state enable row level security;
revoke all on public.hubspot_sync_state from anon, authenticated;

-- A signed-in user (staff in practice) cannot change the stage of a project that has a HubSpot deal.
-- The sync runs as the service role (no auth.uid()), and the creation event is never blocked.
create or replace function public.guard_linked_stage() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not (new.from_stage is null and new.to_stage = 'submitted')
     and exists (select 1 from public.project_internal where project_id = new.project_id and hubspot_deal_id is not null) then
    raise exception 'This project''s stage is set in HubSpot.';
  end if;
  return new;
end $$;
drop trigger if exists stage_events_guard_linked on public.stage_events;
create trigger stage_events_guard_linked before insert on public.stage_events
  for each row execute function public.guard_linked_stage();
