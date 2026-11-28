-- Top-CRM audit 28.11.2026, the work on site. Additive only: new columns, one new table, a replaced function.
--  1. Checklists: a stage's task can carry a list to tick on site (survey, delivery, fitting, handover). The team edits
--     the lists in the stage playbook; a task copies its list when the stage starts. The starting lists fill only
--     playbook rows whose list is still empty.
--  2. Handover records: what was checked, the snags left (each becomes a task), the client's name and signature drawn
--     on the screen, and the date the person enters. Staff only; a PDF of it goes to Documents only if staff share it.
--     Nothing is sent to anyone.

-- ---------- 1. checklists ----------
alter table public.stage_playbook add column if not exists checklist text[] not null default '{}';
alter table public.tasks add column if not exists checklist jsonb not null default '[]'::jsonb
  check (jsonb_typeof(checklist) = 'array' and jsonb_array_length(checklist) <= 40 and pg_column_size(checklist) <= 16384);

update public.stage_playbook b set checklist = v.items
from (values
  ('survey', 'Enter the measured sizes and photos', array['Every opening measured: width, height, diagonals', 'Photos of each opening, inside and out', 'Lintel and structural opening checked', 'Delivery route and access measured', 'Parking and unloading noted', 'Electrics and services near the openings noted']),
  ('delivery', 'Confirm transport, access and unloading', array['Delivery date and time confirmed with the client', 'Lifting plan for heavy panels', 'Parking or a permit arranged', 'Storage on site agreed', 'Glass and frames checked on arrival']),
  ('installation', 'Handover: openings checked, photos taken', array['Every sash opens, closes and locks', 'Drainage and seals checked', 'Glass checked for scratches and labels removed', 'Photos of every opening fitted', 'Site cleaned, packaging removed', 'Client shown how to use and clean', 'Handover record signed']),
  ('handover', 'Send the O&M manual, warranty and final invoice', array['O&M manual uploaded to Documents', 'Declarations of performance uploaded', 'Warranty sent', 'Final invoice sent'])
) as v(s, t, items)
where b.to_stage = v.s::public.project_stage and b.title = v.t and b.checklist = '{}';

create or replace function public.on_stage_playbook() returns trigger
language plpgsql security definer set search_path = public as $$
declare who uuid;
begin
  if new.from_stage is null then return null; end if; -- the creation event
  begin
    select coalesce(assignee_id, new.actor_id) into who from public.projects where id = new.project_id;
    insert into public.tasks (title, kind, due_on, assignee_id, project_id, template_id, created_by, checklist)
    select b.title, b.kind, public.add_workdays(current_date, b.offset_days), who, new.project_id, b.id, new.actor_id,
      coalesce((select jsonb_agg(jsonb_build_object('t', i, 'done', false)) from unnest(b.checklist) i), '[]'::jsonb)
    from public.stage_playbook b
    where b.active and b.to_stage = new.to_stage
      and not exists (select 1 from public.tasks t where t.project_id = new.project_id and t.template_id = b.id)
    order by b.sort;
  exception when others then
    raise warning 'stage playbook skipped: %', sqlerrm; -- a playbook problem never blocks the stage change
  end;
  return null;
end $$;

-- ---------- 2. handover records ----------
create table if not exists public.handover_records (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  checks jsonb not null default '[]'::jsonb check (jsonb_typeof(checks) = 'array' and pg_column_size(checks) <= 16384),
  snags jsonb not null default '[]'::jsonb check (jsonb_typeof(snags) = 'array' and pg_column_size(snags) <= 16384),
  notes text not null default '' check (length(notes) <= 4000),
  signed_name text not null default '' check (length(signed_name) <= 120),
  signature text check (signature is null or (signature like 'data:image/png;base64,%' and length(signature) <= 300000)),
  signed_on date,
  document_id uuid references public.documents (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists handover_records_project on public.handover_records (project_id, created_at desc);
alter table public.handover_records enable row level security;
drop policy if exists "handover staff" on public.handover_records;
create policy "handover staff" on public.handover_records for all to authenticated using (public.is_staff()) with check (public.is_staff());
revoke all on public.handover_records from anon;
grant select, insert, update on public.handover_records to authenticated;

do $$ begin
  drop trigger if exists crm_log_handover on public.handover_records;
  create trigger crm_log_handover after insert or update on public.handover_records for each row
    execute function public.crm_log_change('project_id', 'handover', 'id', 'signed_name', 'signed_on', 'document_id');
end $$;

-- A tick on site changes one item only (two people ticking at once never undo each other), with who and when.
grant insert (checklist) on public.tasks to authenticated;
grant update (checklist) on public.tasks to authenticated;
create or replace function public.tick_checklist(task uuid, item int, done boolean) returns jsonb
language plpgsql security definer set search_path = public as $fn$
declare out jsonb;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  update public.tasks set checklist = jsonb_set(checklist, array[item::text],
      (checklist -> item) || jsonb_build_object('done', coalesce(done, false), 'by', auth.uid(), 'at', now()))
    where id = task and item >= 0 and item < jsonb_array_length(checklist)
    returning checklist into out;
  if out is null then raise exception 'That item is not on the list.'; end if;
  return out;
end $fn$;
revoke all on function public.tick_checklist(uuid, int, boolean) from public, anon;
grant execute on function public.tick_checklist(uuid, int, boolean) to authenticated;
