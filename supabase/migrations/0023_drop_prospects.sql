-- Prospects move to HubSpot (owner decision, 01.11.2026): the staff CRM tab "Prospects" (0014) goes, and so does its table.
-- The table was empty when this was written, so there was nothing to export. If anyone added a row since, stop instead
-- of losing it: export it to HubSpot first, delete it, then push again.

do $$
begin
  if exists (select 1 from public.prospects) then
    raise exception 'public.prospects is not empty: export the rows to HubSpot and delete them before dropping the table';
  end if;
end $$;

drop table public.prospects;
drop function public.prospects_touch();
