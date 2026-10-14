-- Brick & Pane — project portal (client portal + internal CRM)
-- Run in the Supabase SQL editor or with `supabase db push`.
-- Roles: 'client' (architects, developers, homeowners) and 'staff'.
-- Clients see only projects they are members of, and only client-visible records.

-- gen_random_uuid() is built into Postgres 13+ (Supabase runs 15+).

-- ---------- enums ----------
create type public.user_role as enum ('client', 'staff');
create type public.project_stage as enum (
  'submitted',      -- 1 Received
  'in_review',      -- 2 Technical review
  'clarification',  -- 3 Questions for you          (waiting on client)
  'quote_issued',   -- 4 Quote issued               (waiting on client)
  'accepted',       -- 5 Order confirmed
  'survey',         -- 6 Site survey
  'drawings',       -- 7 Shop drawings for approval (waiting on client)
  'production',     -- 8 In production
  'delivery',       -- 9 Delivery scheduled
  'installation',   -- 10 Installation
  'handover',       -- 11 Handover
  'completed',      -- 12 Completed
  'on_hold',
  'closed'
);
create type public.doc_kind as enum ('client_upload', 'quote', 'drawing', 'survey', 'certificate', 'om_manual', 'other');
create type public.approval_state as enum ('none', 'pending', 'approved', 'changes_requested');

-- ---------- profiles ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  company text not null default '',
  phone text not null default '',
  role public.user_role not null default 'client',
  notify_email boolean not null default true,
  notify_digest boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.is_staff() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where id = auth.uid() and role = 'staff');
$$;

-- New auth user -> profile (role is always 'client'; staff is granted by SQL only).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, company)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''), coalesce(new.raw_user_meta_data->>'company', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Clients may not change their own role.
create or replace function public.protect_role() returns trigger
language plpgsql as $$
begin
  -- auth.uid() is null for the SQL editor / service role, which may grant staff.
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_staff() then
    raise exception 'role can only be changed by staff';
  end if;
  return new;
end $$;
create trigger profiles_protect_role before update on public.profiles
  for each row execute function public.protect_role();

-- ---------- projects ----------
create sequence public.project_ref_seq;

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null default ('BP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.project_ref_seq')::text, 4, '0')),
  name text not null,
  owner_id uuid not null references public.profiles (id),
  assignee_id uuid references public.profiles (id),
  stage public.project_stage not null default 'submitted',
  stage_changed_at timestamptz not null default now(),
  next_step text not null default 'We''ll confirm receipt and assign a technical lead.',
  due_at timestamptz default (now() + interval '1 day'), -- when the next update is promised
  location text not null default '',
  riba_stage text not null default '',
  building_type text not null default '',
  systems text[] not null default '{}',
  start_window text not null default '',
  brief text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.project_members (
  project_id uuid references public.projects (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  role text not null default 'collaborator' check (role in ('owner', 'collaborator')),
  primary key (project_id, user_id)
);

create or replace function public.is_member(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.project_members where project_id = p and user_id = auth.uid());
$$;

-- Staff-only commercial data lives in its own table so RLS can hide it entirely.
create table public.project_internal (
  project_id uuid primary key references public.projects (id) on delete cascade,
  value_gbp numeric(12, 2),
  probability int check (probability between 0 and 100),
  notes text not null default '',
  updated_at timestamptz not null default now()
);

create table public.openings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  ref text not null default '',
  system text not null default 'lift-slide',
  width_mm int check (width_mm between 300 and 30000),
  height_mm int check (height_mm between 300 and 6000),
  config text not null default '',
  glazing text not null default '',
  qty int not null default 1 check (qty > 0),
  notes text not null default ''
);

create table public.stage_events (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  from_stage public.project_stage,
  to_stage public.project_stage not null,
  note text not null default '',
  visible_to_client boolean not null default true,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  kind public.doc_kind not null default 'other',
  title text not null,
  version text not null default '',
  storage_path text,
  size_bytes bigint,
  visible_to_client boolean not null default true,
  approval public.approval_state not null default 'none',
  uploaded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.approvals (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  decision public.approval_state not null check (decision in ('approved', 'changes_requested')),
  comment text not null default '',
  actor_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid not null references public.profiles (id),
  body text not null check (length(body) between 1 and 10000),
  internal boolean not null default false,   -- staff-only note
  created_at timestamptz not null default now()
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  type text not null,            -- stage | document | approval_request | approval | message | new_project
  title text not null,
  body text not null default '',
  read_at timestamptz,
  emailed_at timestamptz,
  created_at timestamptz not null default now()
);

create index on public.projects (owner_id);
create index on public.projects (stage);
create index on public.stage_events (project_id, created_at);
create index on public.documents (project_id);
create index on public.messages (project_id, created_at);
create index on public.notifications (user_id, read_at);

-- ---------- notification helpers ----------
create or replace function public.notify_members(p uuid, t text, ttl text, b text) returns void
language sql security definer set search_path = public as $$
  insert into public.notifications (user_id, project_id, type, title, body)
  select m.user_id, p, t, ttl, b from public.project_members m where m.project_id = p;
$$;

create or replace function public.notify_staff(p uuid, t text, ttl text, b text) returns void
language plpgsql security definer set search_path = public as $$
declare a uuid;
begin
  select assignee_id into a from public.projects where id = p;
  if a is not null then
    insert into public.notifications (user_id, project_id, type, title, body) values (a, p, t, ttl, b);
  else
    insert into public.notifications (user_id, project_id, type, title, body)
    select id, p, t, ttl, b from public.profiles where role = 'staff';
  end if;
end $$;

-- ---------- triggers ----------
-- On project insert: owner membership, first timeline event, staff alert.
create or replace function public.on_project_created() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role) values (new.id, new.owner_id, 'owner');
  insert into public.project_internal (project_id) values (new.id);
  insert into public.stage_events (project_id, to_stage, note, actor_id)
    values (new.id, 'submitted', 'Project received.', new.owner_id);
  perform public.notify_staff(new.id, 'new_project', 'New project: ' || new.name, new.ref || ' · ' || new.location);
  return new;
end $$;
create trigger projects_after_insert after insert on public.projects
  for each row execute function public.on_project_created();

-- Clients can't move their own project or reassign it; staff can.
create or replace function public.guard_project_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_staff() and (
    new.stage is distinct from old.stage or new.assignee_id is distinct from old.assignee_id or
    new.owner_id is distinct from old.owner_id or new.next_step is distinct from old.next_step or
    new.due_at is distinct from old.due_at) then
    raise exception 'only staff can change stage, owner, assignee, next step or due date';
  end if;
  new.updated_at = now();
  return new;
end $$;
create trigger projects_guard before update on public.projects
  for each row execute function public.guard_project_update();

-- Stage events drive projects.stage and client notifications.
create or replace function public.on_stage_event() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  if new.from_stage is null and new.to_stage = 'submitted' then return new; end if; -- creation event
  update public.projects set stage = new.to_stage, stage_changed_at = new.created_at where id = new.project_id
    returning name into pname;
  if new.visible_to_client then
    perform public.notify_members(new.project_id, 'stage', pname || ': ' || replace(new.to_stage::text, '_', ' '), new.note);
  end if;
  return new;
end $$;
create trigger stage_events_after_insert after insert on public.stage_events
  for each row execute function public.on_stage_event();

create or replace function public.on_document() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select name into pname from public.projects where id = new.project_id;
  if public.is_staff() and new.visible_to_client then
    if new.approval = 'pending' then
      perform public.notify_members(new.project_id, 'approval_request', 'Approval needed: ' || new.title, pname);
    else
      perform public.notify_members(new.project_id, 'document', 'New document: ' || new.title, pname);
    end if;
  elsif not public.is_staff() then
    perform public.notify_staff(new.project_id, 'document', 'Client uploaded: ' || new.title, pname);
  end if;
  return new;
end $$;
create trigger documents_after_insert after insert on public.documents
  for each row execute function public.on_document();

create or replace function public.on_approval() returns trigger
language plpgsql security definer set search_path = public as $$
declare dtitle text;
begin
  update public.documents set approval = new.decision where id = new.document_id returning title into dtitle;
  perform public.notify_staff(new.project_id, 'approval',
    (case when new.decision = 'approved' then 'Approved: ' else 'Changes requested: ' end) || dtitle, new.comment);
  return new;
end $$;
create trigger approvals_after_insert after insert on public.approvals
  for each row execute function public.on_approval();

create or replace function public.on_message() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select name into pname from public.projects where id = new.project_id;
  if new.internal then return new; end if;
  if public.is_staff() then
    perform public.notify_members(new.project_id, 'message', 'New message: ' || pname, left(new.body, 200));
  else
    perform public.notify_staff(new.project_id, 'message', 'Client message: ' || pname, left(new.body, 200));
  end if;
  return new;
end $$;
create trigger messages_after_insert after insert on public.messages
  for each row execute function public.on_message();

-- ---------- row level security ----------
alter table public.profiles enable row level security;
alter table public.projects enable row level security;
alter table public.project_members enable row level security;
alter table public.project_internal enable row level security;
alter table public.openings enable row level security;
alter table public.stage_events enable row level security;
alter table public.documents enable row level security;
alter table public.approvals enable row level security;
alter table public.messages enable row level security;
alter table public.notifications enable row level security;

-- profiles: own row; staff see all; clients see staff names on their projects.
create policy "profiles read" on public.profiles for select using (
  id = auth.uid() or public.is_staff() or role = 'staff'
);
create policy "profiles update own" on public.profiles for update using (id = auth.uid() or public.is_staff());

-- projects
create policy "projects read" on public.projects for select using (public.is_staff() or owner_id = auth.uid() or public.is_member(id));
create policy "projects client insert" on public.projects for insert with check (owner_id = auth.uid() and stage = 'submitted');
create policy "projects update" on public.projects for update using (public.is_staff() or owner_id = auth.uid());

create policy "members read" on public.project_members for select using (public.is_staff() or user_id = auth.uid() or public.is_member(project_id));
create policy "members staff write" on public.project_members for all using (public.is_staff()) with check (public.is_staff());

create policy "internal staff only" on public.project_internal for all using (public.is_staff()) with check (public.is_staff());

-- openings: members read; clients edit only while the project is with us for review or questions.
create policy "openings read" on public.openings for select using (public.is_staff() or public.is_member(project_id));
create policy "openings write" on public.openings for all using (
  public.is_staff() or (public.is_member(project_id) and exists (select 1 from public.projects p where p.id = project_id and p.stage in ('submitted', 'clarification')))
) with check (
  public.is_staff() or (public.is_member(project_id) and exists (select 1 from public.projects p where p.id = project_id and p.stage in ('submitted', 'clarification')))
);

-- stage events: clients see visible events; only staff write.
create policy "events read" on public.stage_events for select using (public.is_staff() or (public.is_member(project_id) and visible_to_client));
create policy "events staff insert" on public.stage_events for insert with check (public.is_staff() and actor_id = auth.uid());

-- documents
create policy "docs read" on public.documents for select using (public.is_staff() or (public.is_member(project_id) and visible_to_client));
create policy "docs insert" on public.documents for insert with check (
  public.is_staff() or (public.is_member(project_id) and kind = 'client_upload' and approval = 'none' and uploaded_by = auth.uid())
);
create policy "docs staff update" on public.documents for update using (public.is_staff());

-- approvals: members decide on pending, client-visible documents of their project.
create policy "approvals read" on public.approvals for select using (public.is_staff() or public.is_member(project_id));
create policy "approvals insert" on public.approvals for insert with check (
  actor_id = auth.uid() and public.is_member(project_id) and exists (
    select 1 from public.documents d where d.id = document_id and d.project_id = project_id and d.approval = 'pending' and d.visible_to_client)
);

-- messages: clients never see or write internal notes.
create policy "messages read" on public.messages for select using (public.is_staff() or (public.is_member(project_id) and not internal));
create policy "messages insert" on public.messages for insert with check (
  author_id = auth.uid() and (public.is_staff() or (public.is_member(project_id) and not internal))
);

-- notifications: own only.
create policy "notifications read" on public.notifications for select using (user_id = auth.uid());
create policy "notifications mark read" on public.notifications for update using (user_id = auth.uid());

-- ---------- realtime ----------
alter publication supabase_realtime add table public.projects, public.stage_events, public.documents, public.messages, public.notifications;

-- ---------- storage ----------
-- Private bucket; objects stored as <project_id>/<uuid>-<filename>.
insert into storage.buckets (id, name, public, file_size_limit)
values ('project-files', 'project-files', false, 52428800)
on conflict (id) do nothing;

create policy "files read" on storage.objects for select using (
  bucket_id = 'project-files' and (
    public.is_staff() or exists (
      select 1 from public.documents d
      where d.storage_path = name and d.visible_to_client and public.is_member(d.project_id)))
);
create policy "files upload" on storage.objects for insert with check (
  bucket_id = 'project-files' and (public.is_staff() or public.is_member(((storage.foldername(name))[1])::uuid))
);

-- ---------- making someone staff (run manually) ----------
-- update public.profiles set role = 'staff' where id = (select id from auth.users where email = 'you@brickandpane.co.uk');
