-- Portal events → notes on the HubSpot deal (owner decision 01.11.2026, tasks 6 and 7). Triggers queue an event;
-- the hubspot-events Edge Function (cron in 0022) turns each into one note on the project's deal, so HubSpot is
-- called in batches and never from inside a portal change. Queued: a client's message, an accepted quotation, a
-- client's upload, and a document the team adds. Notes carry no message text and no amounts, only a link to the CRM.
-- Service role only. Runs in tests/db (no pg_net or pg_cron here).

create table if not exists public.hubspot_events (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('message', 'quote_accepted', 'client_upload', 'document')),
  project_id uuid not null references public.projects (id) on delete cascade,
  source_id uuid not null,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  note_id text,
  unique (kind, source_id)
);
create index if not exists hubspot_events_pending on public.hubspot_events (created_at) where sent_at is null;
alter table public.hubspot_events enable row level security;
revoke all on public.hubspot_events from anon, authenticated;

create or replace function public.hubspot_queue(k text, pid uuid, src uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.hubspot_events (kind, project_id, source_id) values (k, pid, src) on conflict do nothing;
exception when others then null; -- HubSpot is a copy; never let it break the change that queued it
end $$;
revoke execute on function public.hubspot_queue(text, uuid, uuid) from public, anon, authenticated;

-- A message from the client (not staff, not an internal note).
create or replace function public.hubspot_queue_message() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not new.internal and not exists (select 1 from public.profiles where id = new.author_id and role = 'staff') then
    perform public.hubspot_queue('message', new.project_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists messages_hubspot_queue on public.messages;
create trigger messages_hubspot_queue after insert on public.messages
  for each row execute function public.hubspot_queue_message();

-- A quotation accepted (by the client, or recorded by staff on their behalf).
create or replace function public.hubspot_queue_approval() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.decision = 'approved' and exists (select 1 from public.documents where id = new.document_id and kind = 'quote') then
    perform public.hubspot_queue('quote_accepted', new.project_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists approvals_hubspot_queue on public.approvals;
create trigger approvals_hubspot_queue after insert on public.approvals
  for each row execute function public.hubspot_queue_approval();

-- A file: the client's upload, or a document the team adds (quotation, drawing…).
create or replace function public.hubspot_queue_document() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.hubspot_queue(case when new.kind = 'client_upload' then 'client_upload' else 'document' end, new.project_id, new.id);
  return new;
end $$;
drop trigger if exists documents_hubspot_queue on public.documents;
create trigger documents_hubspot_queue after insert on public.documents
  for each row execute function public.hubspot_queue_document();
