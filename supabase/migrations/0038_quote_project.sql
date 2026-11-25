-- Quotes belong to a project (CRM audit 24.11.2026, K2, phase 2). Additive: new nullable columns, a relaxed NOT NULL,
-- functions replaced with versions that keep every earlier behaviour.
--  1. quotes.project_id: "New quote" on a project card starts a quote pinned to it. Filled for existing quotes from the
--     HubSpot deal both share (project_internal.hubspot_deal_id), where one exists.
--  2. A quote can be sent without a HubSpot deal: quote_sends.hubspot_deal_id may be null, the send records the project
--     instead, and the HubSpot function never claims a send without a deal.
--  3. The margin's sale also counts quotes sent on the project itself, not only on its deal.

alter table public.quotes add column if not exists project_id uuid references public.projects (id) on delete set null;
create index if not exists quotes_project on public.quotes (project_id) where project_id is not null;
update public.quotes q set project_id = pi.project_id
from public.project_internal pi
where q.project_id is null and q.hubspot_deal_id is not null and pi.hubspot_deal_id = q.hubspot_deal_id;

alter table public.quote_sends add column if not exists project_id uuid references public.projects (id) on delete set null;
alter table public.quote_sends alter column hubspot_deal_id drop not null;
create index if not exists quote_sends_project on public.quote_sends (project_id, created_at desc) where project_id is not null;
grant insert (project_id) on public.quote_sends to authenticated;

-- Sending marks the quote sent, as in 0026, but never clears a deal or project the send did not name.
create or replace function public.quote_sent() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.quotes set
    hubspot_deal_id = coalesce(new.hubspot_deal_id, hubspot_deal_id),
    project_id = coalesce(new.project_id, project_id),
    status = case when status in ('accepted', 'declined') then status else 'sent' end,
    status_source = case when status in ('accepted', 'declined') then status_source else 'crm' end,
    status_at = case when status in ('accepted', 'declined') then status_at else now() end
  where id = new.quote_id;
  return new;
end $$;
revoke execute on function public.quote_sent() from public, anon, authenticated;

-- As in 0026, plus: a send without a deal has nothing to do in HubSpot.
create or replace function public.claim_quote_send(sid uuid, max_attempts int default 5) returns setof public.quote_sends
language sql security definer set search_path = public as $$
  update public.quote_sends set hubspot_attempts = hubspot_attempts + 1, hubspot_attempted_at = now(), hubspot_error = null
  where id = sid and hubspot_deal_id is not null and hubspot_note_id is null and hubspot_attempts < max_attempts
    and (hubspot_attempted_at is null or hubspot_error is not null or hubspot_attempted_at < now() - interval '2 minutes')
  returning *;
$$;
revoke execute on function public.claim_quote_send(uuid, int) from public, anon, authenticated;
grant execute on function public.claim_quote_send(uuid, int) to service_role;

-- As in 0031, but a send counts when it went to the project's deal OR names the project.
create or replace function public.project_margin(pid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare deal text; sale numeric; src text; refs text; cost numeric; n int;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  select hubspot_deal_id into deal from public.project_internal where project_id = pid;
  with last as (
    select distinct on (s.quote_id) s.quote_id, s.reference, s.total / (1 + s.vat_rate / 100) as net
    from public.quote_sends s join public.quotes q on q.id = s.quote_id
    where (s.project_id = pid or (deal is not null and s.hubspot_deal_id = deal)) and q.status = 'accepted'
    order by s.quote_id, s.created_at desc)
  select sum(net), string_agg(reference, ', ' order by reference) into sale, refs from last;
  if sale is not null then src := 'accepted'; end if;
  if sale is null then
    select s.total / (1 + s.vat_rate / 100), s.reference into sale, refs
    from public.quote_sends s join public.quotes q on q.id = s.quote_id
    where (s.project_id = pid or (deal is not null and s.hubspot_deal_id = deal)) and q.status <> 'declined'
    order by s.created_at desc limit 1;
    if sale is not null then src := 'sent'; end if;
  end if;
  if sale is null then
    select value_gbp into sale from public.project_internal where project_id = pid;
    if sale is not null then src := 'value'; end if;
  end if;
  select coalesce(sum(amount * fx_to_gbp), 0), count(*) into cost, n
  from public.supplier_quotes where project_id = pid and status = 'accepted';
  return jsonb_build_object(
    'sale_gbp', round(sale, 2), 'sale_source', src, 'sale_refs', refs,
    'cost_gbp', round(cost, 2), 'accepted', n,
    'margin_gbp', case when sale is null then null else round(sale - cost, 2) end,
    'margin_pct', case when sale is null or sale = 0 then null else round((sale - cost) / sale * 100, 1) end);
end $$;
revoke execute on function public.project_margin(uuid) from public, anon;
grant execute on function public.project_margin(uuid) to authenticated;
