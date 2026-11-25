-- CRM audit, phase 4: the owner's dashboard. The data it needs, added only (real projects untouched):
--   project_internal.source / campaign   where the work came from (copied from the enquiry when there was one)
--   project_internal.lost_reason         why a closed project was lost
--   contact_requests.replied_at          when the team first answered (set when the status leaves "new")
-- and one function, owner_dashboard(days), that the CRM reads for every figure on the page. Staff only.

alter table public.project_internal
  add column if not exists source text check (source in ('website', 'email', 'phone', 'referral', 'repeat', 'cold', 'other')),
  add column if not exists campaign text not null default '' check (length(campaign) <= 120),
  add column if not exists lost_reason text not null default '' check (length(lost_reason) <= 500);

-- A project made from a website enquiry came from the website. Only fills an empty source.
update public.project_internal i set source = 'website'
where i.source is null and exists (select 1 from public.contact_requests r where r.project_id = i.project_id);

alter table public.contact_requests add column if not exists replied_at timestamptz;
-- The first time an enquiry leaves "new" is the first reply. Older enquiries keep an empty time: it is not known.
create or replace function public.contact_requests_replied() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.status = 'new' and new.status <> 'new' and new.replied_at is null then new.replied_at := now(); end if;
  return new;
end $$;
drop trigger if exists contact_requests_replied on public.contact_requests;
create trigger contact_requests_replied before update of status on public.contact_requests
  for each row execute function public.contact_requests_replied();

-- Every figure on the dashboard for the last `days` days, in £ ex VAT. Margin per project as project_margin does it.
create or replace function public.owner_dashboard(days int default 90) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare since timestamptz := now() - make_interval(days => greatest(1, least(days, 3650))); out jsonb;
begin
  if not public.is_staff() then raise exception 'staff only' using errcode = '42501'; end if;
  with
  proj as (select p.id, p.ref, p.name, p.stage, p.created_at, p.assignee_id, i.value_gbp, i.source, i.campaign, i.lost_reason
           from public.projects p left join public.project_internal i on i.project_id = p.id),
  enq as (select * from public.contact_requests where created_at >= since and status <> 'spam'),
  firstsend as (select coalesce(s.project_id, (select i.project_id from public.project_internal i where i.hubspot_deal_id = s.hubspot_deal_id limit 1)) as pid,
                       min(s.created_at) as at
                from public.quote_sends s group by 1),
  reached as (select project_id, to_stage, min(created_at) as at from public.stage_events group by 1, 2),
  quoted as (select p.id, coalesce(f.at, r.at) as at from proj p left join firstsend f on f.pid = p.id
             left join reached r on r.project_id = p.id and r.to_stage = 'quote_issued' where coalesce(f.at, r.at) is not null),
  won as (select p.*, r.at from proj p join reached r on r.project_id = p.id and r.to_stage = 'accepted'),
  lost as (select p.*, r.at from proj p join reached r on r.project_id = p.id and r.to_stage = 'closed'
           where not exists (select 1 from reached w where w.project_id = p.id and w.to_stage = 'accepted')),
  inplay as (select q.id, q.reference, q.project_id, s.created_at as sent_at, s.total / (1 + s.vat_rate / 100) as net
             from public.quotes q join lateral (select * from public.quote_sends x where x.quote_id = q.id order by x.created_at desc limit 1) s on true
             where q.status = 'sent'),
  marg as (select p.id, p.ref, p.name, public.project_margin(p.id) as m from proj p
           where p.stage not in ('closed') and exists (select 1 from public.supplier_quotes c where c.project_id = p.id and c.status = 'accepted'))
  select jsonb_build_object(
    'days', days,
    'enquiries', (select count(*) from enq),
    'enquiries_by_source', (select coalesce(jsonb_agg(jsonb_build_object('source', s, 'n', n) order by n desc), '[]') from
      (select coalesce(i.source, 'unknown') s, count(*) n from public.projects p left join public.project_internal i on i.project_id = p.id
       where p.created_at >= since group by 1) x),
    'projects_new', (select count(*) from proj where created_at >= since),
    'quoted', (select count(*) from quoted q join proj p on p.id = q.id where p.created_at >= since),
    'won', (select count(*) from won where at >= since),
    'won_value', (select coalesce(sum(value_gbp), 0) from won where at >= since),
    'lost', (select count(*) from lost where at >= since),
    'lost_reasons', (select coalesce(jsonb_agg(jsonb_build_object('reason', reason, 'n', n) order by n desc), '[]') from
      (select coalesce(nullif(trim(lost_reason), ''), '—') reason, count(*) n from lost where at >= since group by 1) x),
    'reply_hours_median', (select round((percentile_cont(0.5) within group (order by extract(epoch from replied_at - created_at) / 3600))::numeric, 1)
      from enq where replied_at is not null),
    'replied_known', (select count(*) from enq where replied_at is not null),
    'unanswered', (select count(*) from public.contact_requests where status = 'new'),
    'quote_days_median', (select round((percentile_cont(0.5) within group (order by extract(epoch from q.at - p.created_at) / 86400))::numeric, 1)
      from quoted q join proj p on p.id = q.id where q.at >= since),
    'in_play', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'reference', reference, 'project_id', project_id, 'sent_at', sent_at, 'net', round(net, 2)) order by sent_at), '[]') from inplay),
    'in_play_value', (select coalesce(round(sum(net), 2), 0) from inplay),
    'margin', (select jsonb_build_object('projects', count(*), 'sale', coalesce(round(sum((m->>'sale_gbp')::numeric), 2), 0), 'cost', coalesce(round(sum((m->>'cost_gbp')::numeric), 2), 0),
      'low', coalesce(jsonb_agg(jsonb_build_object('id', id, 'ref', ref, 'name', name, 'pct', (m->>'margin_pct')::numeric)) filter (where (m->>'margin_pct')::numeric < 20), '[]'))
      from marg where m->>'sale_gbp' is not null),
    'paid', (select coalesce(sum(amount), 0) from public.payments where paid_at >= since),
    'due_30', (select coalesce(sum(amount), 0) from public.payments where paid_at is null and due_date >= now() and due_date < now() + interval '30 days'),
    'overdue', (select coalesce(sum(amount), 0) from public.payments where paid_at is null and due_date < now()),
    'paid_by_month', (select coalesce(jsonb_agg(jsonb_build_object('month', to_char(mo, 'YYYY-MM'), 'gbp', gbp) order by mo), '[]') from
      (select date_trunc('month', paid_at) mo, sum(amount) gbp from public.payments where paid_at >= date_trunc('month', now()) - interval '5 months' group by 1) x),
    'workload', (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'name', full_name, 'projects', np, 'tasks', nt) order by np desc), '[]') from
      (select pr.id, pr.full_name,
         (select count(*) from proj p where p.assignee_id = pr.id and p.stage not in ('completed', 'closed', 'on_hold')) np,
         (select count(*) from public.tasks t where t.assignee_id = pr.id and t.done_at is null) nt
       from public.profiles pr where pr.role = 'staff') x)
  ) into out;
  return out;
end $$;
revoke execute on function public.owner_dashboard(int) from public, anon;
grant execute on function public.owner_dashboard(int) to authenticated;
