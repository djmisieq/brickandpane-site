-- After the audit of 25.11.2026 (UK GDPR): the cold campaign list needs a "do not contact" flag and the deletion the
-- privacy notice promises (prospects not contacted for 12 months are removed). Additive; nothing is deleted today:
-- the imported list is from 25.11.2026, so the first removals are due in November 2027 unless contact happens.
alter table public.companies
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists last_contacted_at timestamptz;
alter table public.people
  add column if not exists do_not_contact boolean not null default false,
  add column if not exists last_contacted_at timestamptz;

-- Removes cold-list companies (and their people) with no project, no portal account and no contact for 12 months.
-- "Do not contact" ones stay, as the suppression list that stops them being contacted again; their notes are cleared.
create or replace function public.purge_cold_prospects() returns jsonb
language plpgsql security definer set search_path = public as $$
declare gone_people int; gone_companies int;
begin
  with doomed as (
    select c.id from public.companies c
    where c.source = 'cold' and not c.do_not_contact
      and coalesce(c.last_contacted_at, c.created_at) < now() - interval '12 months'
      and not exists (select 1 from public.project_companies pc where pc.company_id = c.id)
      and not exists (select 1 from public.people p where p.company_id = c.id and (p.profile_id is not null or p.do_not_contact
        or p.last_contacted_at >= now() - interval '12 months'))
  ), dp as (
    delete from public.people p using doomed d where p.company_id = d.id returning 1
  ), dc as (
    delete from public.companies c using doomed d where c.id = d.id returning 1
  )
  select (select count(*) from dp), (select count(*) from dc) into gone_people, gone_companies;
  update public.companies set notes = '' where source = 'cold' and do_not_contact and notes <> '';
  return jsonb_build_object('people', gone_people, 'companies', gone_companies);
end $$;
revoke execute on function public.purge_cold_prospects() from public, anon, authenticated;
