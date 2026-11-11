-- The rest of the CRM onto the deal (owner decision 11.11.2026: "wszystkie cztery", payments with amounts).
-- Same path as 0021: a trigger queues an event, hubspot-events turns it into one note every 15 minutes, and a
-- failure there never breaks the portal change that queued it.
--   payments  -> payment_due when the team records a stage, payment_paid when it is marked paid (amounts included,
--                unlike the notes from 0021: the owner asked for them here).
--   changes   -> change_raised on a new entry, change_decided once approved or rejected.
--   openings  -> one note per project that is rewritten as the list changes, not one per row (see below).
--   team      -> team_member when someone joins, team_invite when someone is invited.
alter table public.hubspot_events drop constraint if exists hubspot_events_kind_check;
alter table public.hubspot_events add constraint hubspot_events_kind_check check (kind in (
  'message', 'quote_accepted', 'client_upload', 'document',
  'payment_due', 'payment_paid', 'change_raised', 'change_decided', 'openings', 'team_member', 'team_invite'));

-- The openings list has no single moment worth announcing: it is edited row by row. So one event per project is
-- kept and reopened on every edit, and hubspot-events rewrites the note it already wrote instead of adding another.
create or replace function public.hubspot_queue_again(k text, pid uuid, src uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.hubspot_events (kind, project_id, source_id) values (k, pid, src)
    on conflict (kind, source_id) do update set sent_at = null, created_at = now();
exception when others then null; -- HubSpot is a copy; never let it break the change that queued it
end $$;
revoke execute on function public.hubspot_queue_again(text, uuid, uuid) from public, anon, authenticated;

-- ---------- payments ----------
create or replace function public.hubspot_queue_payment() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.hubspot_queue('payment_due', new.project_id, new.id);
  elsif new.paid_at is not null and old.paid_at is null then
    perform public.hubspot_queue('payment_paid', new.project_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists payments_hubspot_queue on public.payments;
create trigger payments_hubspot_queue after insert or update of paid_at on public.payments
  for each row execute function public.hubspot_queue_payment();

-- ---------- change register ----------
create or replace function public.hubspot_queue_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.hubspot_queue('change_raised', new.project_id, new.id);
  elsif new.status in ('approved', 'rejected') and old.status is distinct from new.status then
    perform public.hubspot_queue('change_decided', new.project_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists changes_hubspot_queue on public.changes;
create trigger changes_hubspot_queue after insert or update of status on public.changes
  for each row execute function public.hubspot_queue_change();

-- ---------- openings ----------
create or replace function public.hubspot_queue_openings() returns trigger
language plpgsql security definer set search_path = public as $$
declare pid uuid := coalesce(new.project_id, old.project_id);
begin
  perform public.hubspot_queue_again('openings', pid, pid); -- one event per project, reopened on every edit
  return coalesce(new, old);
end $$;
drop trigger if exists openings_hubspot_queue on public.openings;
create trigger openings_hubspot_queue after insert or update or delete on public.openings
  for each row execute function public.hubspot_queue_openings();

-- ---------- team ----------
-- project_members is keyed by (project_id, user_id) and has no id of its own, so the event gets a stable one.
create or replace function public.hubspot_queue_member() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- Creating a project makes its owner a member straight away (migration 0001). That is not somebody joining,
  -- so only collaborators are announced; otherwise every new project would post a team note about its owner.
  if new.role = 'owner' then return new; end if;
  perform public.hubspot_queue('team_member', new.project_id, md5(new.project_id::text || new.user_id::text)::uuid);
  return new;
end $$;
drop trigger if exists project_members_hubspot_queue on public.project_members;
create trigger project_members_hubspot_queue after insert on public.project_members
  for each row execute function public.hubspot_queue_member();

create or replace function public.hubspot_queue_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.hubspot_queue('team_invite', new.project_id, new.id);
  return new;
end $$;
drop trigger if exists project_invites_hubspot_queue on public.project_invites;
create trigger project_invites_hubspot_queue after insert on public.project_invites
  for each row execute function public.hubspot_queue_invite();
