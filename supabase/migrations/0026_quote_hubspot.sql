-- Quotes ↔ HubSpot (owner decision 09.11.2026). A quote from the builder (0025) is pinned to one HubSpot deal; sending
-- it records a send: the PDF the client got, the total and a copy of the quote. The hubspot-quotes Edge Function turns
-- each send into one note on the deal ("Portal quote sent · <reference> rev <n>", with the total and the PDF attached)
-- and moves a deal still at Enquiry to Quote sent. Back from HubSpot (cron every 15 min, 0027): the deal's stage sets
-- the status of its quotes (Quote accepted or later → accepted, Closed lost → declined).
-- One deal can carry several independent quotes (each its own row in quotes) and each quote several sends: a new
-- revision when the content changed, or the same revision sent again. Earlier revisions stay as history.
-- Staff only, like 0025. Runs in tests/db.

-- Server-side fields beside the builder's JSON: saveQuote upserts only id, reference, data and updated_at, so these
-- are never overwritten by typing in the builder.
alter table public.quotes
  add column if not exists hubspot_deal_id text,
  add column if not exists hubspot_deal_name text,
  add column if not exists hubspot_dealstage text,
  add column if not exists status text not null default 'draft',
  add column if not exists status_source text,
  add column if not exists status_at timestamptz;
alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes add constraint quotes_status_check check (status in ('draft', 'sent', 'accepted', 'declined'));
alter table public.quotes drop constraint if exists quotes_status_source_check;
alter table public.quotes add constraint quotes_status_source_check check (status_source is null or status_source in ('crm', 'hubspot'));
create index if not exists quotes_deal on public.quotes (hubspot_deal_id) where hubspot_deal_id is not null;

create table if not exists public.quote_sends (
  id uuid primary key default gen_random_uuid(),
  -- A sent quote is a record of what the client got: it cannot be deleted while it has sends.
  quote_id uuid not null references public.quotes (id) on delete restrict,
  hubspot_deal_id text not null check (hubspot_deal_id ~ '^\d+$'),
  reference text not null,
  revision text not null default '00',
  kind text not null check (kind in ('new', 'revision', 'resend')),
  total numeric(12, 2) not null check (total >= 0),
  vat_rate numeric(5, 2) not null default 0,
  pdf_path text not null,
  pdf_name text not null default '',
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object' and pg_column_size(snapshot) <= 262144),
  sent_on date not null default current_date,
  sent_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  -- Filled by the Edge Function (service role); staff may read them.
  hubspot_file_id text,
  hubspot_note_id text,
  hubspot_stage_moved boolean not null default false,
  hubspot_synced_at timestamptz,
  hubspot_error text,
  hubspot_attempts int not null default 0,
  hubspot_attempted_at timestamptz
);
create index if not exists quote_sends_quote on public.quote_sends (quote_id, created_at desc);
create index if not exists quote_sends_pending on public.quote_sends (created_at) where hubspot_note_id is null;

alter table public.quote_sends enable row level security;
drop policy if exists "quote sends staff read" on public.quote_sends;
create policy "quote sends staff read" on public.quote_sends for select to authenticated using (public.is_staff());
drop policy if exists "quote sends staff insert" on public.quote_sends;
create policy "quote sends staff insert" on public.quote_sends for insert to authenticated with check (public.is_staff());
revoke all on public.quote_sends from anon, authenticated;
grant select on public.quote_sends to authenticated;
-- Staff write only what a person decides; the hubspot_* results are the function's.
grant insert (quote_id, hubspot_deal_id, reference, revision, kind, total, vat_rate, pdf_path, pdf_name, snapshot, sent_on) on public.quote_sends to authenticated;

-- Sending a quote marks it sent (unless it is already accepted or declined) and pins the deal it went to.
create or replace function public.quote_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.quotes set
    hubspot_deal_id = new.hubspot_deal_id,
    status = case when status in ('accepted', 'declined') then status else 'sent' end,
    status_source = case when status in ('accepted', 'declined') then status_source else 'crm' end,
    status_at = case when status in ('accepted', 'declined') then status_at else now() end
  where id = new.quote_id;
  return new;
end $$;
revoke execute on function public.quote_sent() from public, anon, authenticated;
drop trigger if exists quote_sends_mark on public.quote_sends;
create trigger quote_sends_mark after insert on public.quote_sends for each row execute function public.quote_sent();

-- The Edge Function claims a send before calling HubSpot, so the button and the cron never write two notes:
-- only one caller gets the row back. A finished attempt that failed may be retried at once; a claim older than
-- 2 minutes (a call that died) may be taken again.
create or replace function public.claim_quote_send(sid uuid, max_attempts int default 5) returns setof public.quote_sends
language sql security definer set search_path = public as $$
  update public.quote_sends set hubspot_attempts = hubspot_attempts + 1, hubspot_attempted_at = now(), hubspot_error = null
  where id = sid and hubspot_note_id is null and hubspot_attempts < max_attempts
    and (hubspot_attempted_at is null or hubspot_error is not null or hubspot_attempted_at < now() - interval '2 minutes')
  returning *;
$$;
revoke execute on function public.claim_quote_send(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_quote_send(uuid, int) to service_role;

-- PDFs as sent: private bucket, staff only, PDF only, 10 MB. Path: <quote id>/<file>.pdf
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('quote-pdfs', 'quote-pdfs', false, 10485760, array['application/pdf'])
on conflict (id) do nothing;
drop policy if exists "quote pdfs staff read" on storage.objects;
create policy "quote pdfs staff read" on storage.objects for select using (bucket_id = 'quote-pdfs' and public.is_staff());
drop policy if exists "quote pdfs staff upload" on storage.objects;
create policy "quote pdfs staff upload" on storage.objects for insert with check (bucket_id = 'quote-pdfs' and public.is_staff());
