-- Portal hardening before the first real clients (22.10.2026, review of RLS, auth and storage).

-- ---------- notification helpers are internal ----------
-- Only the trigger functions (security definer, owned by postgres) call these. Through /rpc anyone,
-- anonymous included, could put their own title and body in an email sent from Brick & Pane.
revoke execute on function public.notify_members(uuid, text, text, text) from public, anon, authenticated;
revoke execute on function public.notify_staff(uuid, text, text, text) from public, anon, authenticated;
-- Functions for signed-in people only.
revoke execute on function public.invite_member(uuid, text, text) from public, anon;
revoke execute on function public.decide_change(uuid, text, text) from public, anon;
revoke execute on function public.can_decide_document(uuid, boolean, public.approval_state) from public, anon;

-- ---------- profiles ----------
-- Names of staff and teammates are for signed-in people, not for the public API key.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated using (
  id = auth.uid() or public.is_staff() or role = 'staff' or exists (
    select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);

-- Clients may not change their role, and the account type (it decides who may accept a quotation)
-- only in the first 15 minutes after sign-up, when the portal applies the type picked before Google/Microsoft.
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL editor / service role, which may grant staff.
  if auth.uid() is null or public.is_staff() then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'role can only be changed by staff';
  end if;
  if new.account_type is distinct from old.account_type and not exists (
    select 1 from auth.users u where u.id = old.id and u.created_at > now() - interval '15 minutes') then
    raise exception 'account type can only be changed by staff';
  end if;
  return new;
end $$;

-- ---------- projects ----------
-- A client creating a project sets only its description; the rest stays as staff would start it.
create or replace function public.guard_project_insert() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_staff() then
    new.ref := 'BP-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.project_ref_seq')::text, 4, '0');
    new.assignee_id := null;
    new.stage := 'submitted';
    new.stage_changed_at := now();
    new.next_step := 'We’ll confirm receipt.';
    new.due_at := null;
    new.delivery_at := null;
    new.install_at := null;
    new.estimate_low := null;
    new.estimate_high := null;
    new.created_at := now();
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger projects_guard_insert before insert on public.projects
  for each row execute function public.guard_project_insert();

create or replace function public.guard_project_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_staff() and (
    new.stage is distinct from old.stage or new.assignee_id is distinct from old.assignee_id or
    new.owner_id is distinct from old.owner_id or new.next_step is distinct from old.next_step or
    new.due_at is distinct from old.due_at or new.delivery_at is distinct from old.delivery_at or
    new.install_at is distinct from old.install_at or new.estimate_low is distinct from old.estimate_low or
    new.estimate_high is distinct from old.estimate_high or new.ref is distinct from old.ref or
    new.stage_changed_at is distinct from old.stage_changed_at or new.created_at is distinct from old.created_at) then
    raise exception 'only staff can change stage, owner, assignee, reference, dates or estimates';
  end if;
  new.updated_at = now();
  return new;
end $$;

-- ---------- invitations wait for a confirmed email ----------
-- Before: an account created (not yet confirmed) on someone else's address took over their project.
create or replace function public.claim_invites(uid uuid, addr text) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into public.project_members (project_id, user_id, role)
    select project_id, uid, case when make_owner then 'owner' else role end
    from public.project_invites where email = lower(addr)
    on conflict do nothing;
  update public.projects set owner_id = uid
    where id in (select project_id from public.project_invites where email = lower(addr) and make_owner);
  delete from public.project_invites where email = lower(addr);
end $$;
revoke execute on function public.claim_invites(uuid, text) from public, anon, authenticated;

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, company, account_type)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    coalesce(new.raw_user_meta_data->>'company', ''),
    case when new.raw_user_meta_data->>'account_type' in ('architect', 'developer', 'homeowner')
         then new.raw_user_meta_data->>'account_type' else 'architect' end
  );
  -- Google and similar sign-ins arrive confirmed; email sign-ups claim on confirmation (trigger below).
  if new.email_confirmed_at is not null then perform public.claim_invites(new.id, new.email); end if;
  return new;
end $$;

create or replace function public.on_email_confirmed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.claim_invites(new.id, new.email);
  return new;
end $$;
drop trigger if exists on_auth_user_confirmed on auth.users;
create trigger on_auth_user_confirmed after update of email_confirmed_at on auth.users
  for each row when (old.email_confirmed_at is null and new.email_confirmed_at is not null)
  execute function public.on_email_confirmed();

-- ---------- files ----------
-- A document may only point at a file in its own project's folder, and is read only from there.
drop policy if exists "docs insert" on public.documents;
create policy "docs insert" on public.documents for insert with check (
  (storage_path is null or split_part(storage_path, '/', 1) = project_id::text) and (
    public.is_staff() or (public.is_member(project_id) and kind = 'client_upload' and approval = 'none' and uploaded_by = auth.uid()))
);

drop policy if exists "files read" on storage.objects;
create policy "files read" on storage.objects for select using (
  bucket_id = 'project-files' and (
    public.is_staff() or exists (
      select 1 from public.documents d
      where d.storage_path = name and d.project_id::text = (storage.foldername(name))[1]
        and d.visible_to_client and public.is_member(d.project_id)))
);

-- Drawings, photos, documents and archives only: no HTML or SVG that a browser would run.
-- application/octet-stream stays for DWG and other files browsers give no type; it is downloaded, not shown.
update storage.buckets set allowed_mime_types = array[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif', 'image/tiff', 'image/bmp',
  'image/vnd.dwg', 'image/vnd.dxf', 'image/x-dwg', 'application/acad', 'application/x-acad', 'application/dwg', 'application/x-dwg',
  'application/dxf', 'application/x-dxf', 'application/vnd.ms-pki.stl', 'model/stl', 'application/x-autocad',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-powerpoint', 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'application/vnd.oasis.opendocument.text', 'application/vnd.oasis.opendocument.spreadsheet',
  'text/csv', 'text/plain', 'application/rtf',
  'application/zip', 'application/x-zip-compressed', 'application/x-7z-compressed', 'application/vnd.rar', 'application/x-rar-compressed',
  'application/octet-stream'
] where id in ('project-files', 'enquiries');

-- ---------- public form: per-sender limits ----------
-- contact-submit counts recent requests by email and by a hash of the sender's IP (never the IP itself).
alter table public.contact_requests add column if not exists ip_hash text;
create index if not exists contact_requests_recent on public.contact_requests (created_at desc);

-- ---------- a client's new project in one transaction ----------
-- Before: the project, then its openings, in separate requests; a rejected opening left a project without
-- openings and every retry made another one. Runs as the caller, so the usual RLS rules apply.
create or replace function public.create_project(p jsonb, ops jsonb) returns uuid
language plpgsql security invoker set search_path = public as $$
declare pid uuid;
begin
  insert into public.projects (name, owner_id, location, riba_stage, building_type, start_window, brief, systems)
  values (
    coalesce(p->>'name', ''), auth.uid(), coalesce(p->>'location', ''), coalesce(p->>'riba_stage', ''),
    coalesce(p->>'building_type', ''), coalesce(p->>'start_window', ''), coalesce(p->>'brief', ''),
    coalesce(array(select jsonb_array_elements_text(p->'systems')), '{}')
  ) returning id into pid;
  insert into public.openings (project_id, ref, system, material, width_mm, height_mm, config, glazing, qty, notes)
  select pid, coalesce(o.ref, ''), coalesce(nullif(o.system, ''), 'lift-slide'), coalesce(o.material, ''), o.width_mm, o.height_mm,
    coalesce(o.config, ''), coalesce(o.glazing, ''), coalesce(o.qty, 1), coalesce(o.notes, '')
  from jsonb_populate_recordset(null::public.openings, coalesce(ops, '[]')) o;
  return pid;
end $$;
revoke execute on function public.create_project(jsonb, jsonb) from public, anon;
grant execute on function public.create_project(jsonb, jsonb) to authenticated;

-- ---------- deleting an account (UK GDPR erasure) ----------
-- Deleting the user in Supabase (Authentication → Users) removes the profile, memberships and notifications.
-- Before, references to the profile blocked it. Now the records stay with the project and lose the person:
-- projects keep their history with no owner, messages/approvals/changes show no author.
alter table public.projects alter column owner_id drop not null;
alter table public.projects drop constraint if exists projects_owner_id_fkey,
  add constraint projects_owner_id_fkey foreign key (owner_id) references public.profiles (id) on delete set null;
alter table public.projects drop constraint if exists projects_assignee_id_fkey,
  add constraint projects_assignee_id_fkey foreign key (assignee_id) references public.profiles (id) on delete set null;
alter table public.stage_events drop constraint if exists stage_events_actor_id_fkey,
  add constraint stage_events_actor_id_fkey foreign key (actor_id) references public.profiles (id) on delete set null;
alter table public.documents drop constraint if exists documents_uploaded_by_fkey,
  add constraint documents_uploaded_by_fkey foreign key (uploaded_by) references public.profiles (id) on delete set null;
alter table public.approvals alter column actor_id drop not null;
alter table public.approvals drop constraint if exists approvals_actor_id_fkey,
  add constraint approvals_actor_id_fkey foreign key (actor_id) references public.profiles (id) on delete set null;
alter table public.messages alter column author_id drop not null;
alter table public.messages drop constraint if exists messages_author_id_fkey,
  add constraint messages_author_id_fkey foreign key (author_id) references public.profiles (id) on delete set null;
alter table public.project_invites drop constraint if exists project_invites_invited_by_fkey,
  add constraint project_invites_invited_by_fkey foreign key (invited_by) references public.profiles (id) on delete set null;
alter table public.changes alter column raised_by drop not null;
alter table public.changes drop constraint if exists changes_raised_by_fkey,
  add constraint changes_raised_by_fkey foreign key (raised_by) references public.profiles (id) on delete set null;
alter table public.changes drop constraint if exists changes_decided_by_fkey,
  add constraint changes_decided_by_fkey foreign key (decided_by) references public.profiles (id) on delete set null;
