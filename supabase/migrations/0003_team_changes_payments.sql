-- Project team roles, invitations, change register, payments, delivery dates
-- and database-enforced decision rights (who may accept a quotation).

-- ---------- team roles ----------
alter table public.project_members drop constraint if exists project_members_role_check;
alter table public.project_members add constraint project_members_role_check
  check (role in ('owner', 'architect', 'client', 'contractor', 'engineer', 'collaborator'));

-- Team members can see each other's names.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select using (
  id = auth.uid() or public.is_staff() or role = 'staff' or exists (
    select 1 from public.project_members a join public.project_members b on a.project_id = b.project_id
    where a.user_id = auth.uid() and b.user_id = profiles.id)
);

-- ---------- invitations ----------
create table public.project_invites (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  email text not null,
  role text not null check (role in ('architect', 'client', 'contractor', 'engineer')),
  invited_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (project_id, email)
);
alter table public.project_invites enable row level security;
create policy "invites read" on public.project_invites for select using (
  public.is_staff() or exists (select 1 from public.project_members m where m.project_id = project_invites.project_id and m.user_id = auth.uid() and m.role = 'owner')
);

create or replace function public.invite_member(p uuid, e text, r text) returns text
language plpgsql security definer set search_path = public as $$
declare uid uuid; pname text;
begin
  if not (public.is_staff() or exists (select 1 from public.project_members where project_id = p and user_id = auth.uid() and role = 'owner')) then
    raise exception 'Only the project owner can invite people.';
  end if;
  if r not in ('architect', 'client', 'contractor', 'engineer') then raise exception 'Choose a role.'; end if;
  if e !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' then raise exception 'Enter a valid email.'; end if;
  select name into pname from public.projects where id = p;
  select id into uid from auth.users where lower(email) = lower(e);
  if uid is not null then
    if exists (select 1 from public.profiles where id = uid and role = 'staff') then raise exception 'That person is Brick & Pane staff.'; end if;
    if exists (select 1 from public.project_members where project_id = p and user_id = uid) then raise exception 'Already on this project.'; end if;
    insert into public.project_members (project_id, user_id, role) values (p, uid, r);
    insert into public.notifications (user_id, project_id, type, title, body)
      values (uid, p, 'invite', 'You''ve been added to ' || pname, 'As ' || r || '.');
    return 'added';
  end if;
  insert into public.project_invites (project_id, email, role, invited_by) values (p, lower(e), r, auth.uid())
    on conflict (project_id, email) do update set role = excluded.role;
  return 'invited';
end $$;

-- New accounts pick up any pending invitations for their email.
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
  insert into public.project_members (project_id, user_id, role)
    select project_id, new.id, role from public.project_invites where email = lower(new.email)
    on conflict do nothing;
  delete from public.project_invites where email = lower(new.email);
  return new;
end $$;

-- ---------- quotation amounts and decision rights ----------
alter table public.documents add column amount numeric(12, 2);
alter table public.approvals add column on_behalf boolean not null default false;

-- Quotations bind the client: a client member, or an owner who is not an architect, may accept.
-- An architect may accept on the client's behalf only when no client is on the team, and must say so.
create or replace function public.can_decide_document(d uuid, behalf boolean, decision public.approval_state) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.documents doc
    join public.project_members m on m.project_id = doc.project_id and m.user_id = auth.uid()
    join public.profiles pr on pr.id = auth.uid()
    where doc.id = d and doc.approval = 'pending' and doc.visible_to_client and pr.role = 'client' and (
      (doc.kind <> 'quote' and m.role in ('owner', 'architect', 'client', 'engineer'))
      or (doc.kind = 'quote' and (
        m.role = 'client'
        or (m.role = 'owner' and pr.account_type <> 'architect')
        or (m.role in ('owner', 'architect')
            and (behalf or decision = 'changes_requested')
            and not exists (select 1 from public.project_members c where c.project_id = doc.project_id and c.role = 'client'))
      ))
    )
  );
$$;

drop policy if exists "approvals insert" on public.approvals;
create policy "approvals insert" on public.approvals for insert with check (
  actor_id = auth.uid()
  and exists (select 1 from public.documents d where d.id = document_id and d.project_id = approvals.project_id)
  and public.can_decide_document(document_id, on_behalf, decision)
);

-- ---------- delivery and fitting dates ----------
alter table public.projects add column delivery_at timestamptz, add column install_at timestamptz;

create or replace function public.guard_project_update() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and not public.is_staff() and (
    new.stage is distinct from old.stage or new.assignee_id is distinct from old.assignee_id or
    new.owner_id is distinct from old.owner_id or new.next_step is distinct from old.next_step or
    new.due_at is distinct from old.due_at or new.delivery_at is distinct from old.delivery_at or
    new.install_at is distinct from old.install_at or new.estimate_low is distinct from old.estimate_low or
    new.estimate_high is distinct from old.estimate_high) then
    raise exception 'only staff can change stage, owner, assignee, dates or estimates';
  end if;
  new.updated_at = now();
  return new;
end $$;

create or replace function public.on_dates_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_at is distinct from old.delivery_at or new.install_at is distinct from old.install_at then
    perform public.notify_members(new.id, 'dates', new.name || ': dates confirmed',
      concat_ws(' · ', 'Delivery ' || to_char(new.delivery_at, 'Dy DD Mon'), 'Fitting ' || to_char(new.install_at, 'Dy DD Mon')));
  end if;
  return new;
end $$;
create trigger projects_dates_changed after update on public.projects
  for each row execute function public.on_dates_changed();

-- ---------- change register ----------
create table public.changes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  title text not null check (length(title) between 1 and 300),
  description text not null default '',
  impact text not null default '',
  status text not null default 'proposed' check (status in ('proposed', 'approved', 'rejected', 'withdrawn')),
  raised_by uuid not null references public.profiles (id),
  decided_by uuid references public.profiles (id),
  decided_at timestamptz,
  comment text not null default '',
  created_at timestamptz not null default now()
);
create index on public.changes (project_id, created_at);
alter table public.changes enable row level security;
create policy "changes read" on public.changes for select using (public.is_staff() or public.is_member(project_id));
create policy "changes insert" on public.changes for insert with check (
  raised_by = auth.uid() and status = 'proposed' and decided_by is null and (
    public.is_staff() or exists (select 1 from public.project_members m where m.project_id = changes.project_id and m.user_id = auth.uid() and m.role <> 'contractor'))
);
-- No direct updates: decisions go through decide_change().

create or replace function public.on_change_raised() returns trigger
language plpgsql security definer set search_path = public as $$
declare pname text;
begin
  select name into pname from public.projects where id = new.project_id;
  if public.is_staff() then
    perform public.notify_members(new.project_id, 'change', 'Change for your approval: ' || new.title, pname);
  else
    perform public.notify_staff(new.project_id, 'change', 'Change requested: ' || new.title, pname);
  end if;
  return new;
end $$;
create trigger changes_after_insert after insert on public.changes
  for each row execute function public.on_change_raised();

create or replace function public.decide_change(c uuid, decision text, note text default '') returns void
language plpgsql security definer set search_path = public as $$
declare ch public.changes; raiser_staff boolean; mine text;
begin
  select * into ch from public.changes where id = c for update;
  if ch.id is null or ch.status <> 'proposed' then raise exception 'This change is not awaiting a decision.'; end if;
  if decision not in ('approved', 'rejected', 'withdrawn') then raise exception 'Unknown decision.'; end if;
  select role = 'staff' into raiser_staff from public.profiles where id = ch.raised_by;
  if decision = 'withdrawn' then
    if ch.raised_by <> auth.uid() then raise exception 'Only the person who raised a change can withdraw it.'; end if;
  elsif public.is_staff() then
    if raiser_staff then raise exception 'The client decides on changes you propose.'; end if;
  else
    select role into mine from public.project_members where project_id = ch.project_id and user_id = auth.uid();
    if mine is null or mine = 'contractor' then raise exception 'You can''t decide on changes for this project.'; end if;
    if not raiser_staff then raise exception 'Brick & Pane responds to change requests from your team.'; end if;
  end if;
  update public.changes set status = decision, decided_by = auth.uid(), decided_at = now(), comment = coalesce(note, '') where id = c;
  if public.is_staff() then
    perform public.notify_members(ch.project_id, 'change', 'Change ' || decision || ': ' || ch.title, coalesce(note, ''));
  else
    perform public.notify_staff(ch.project_id, 'change', 'Change ' || decision || ': ' || ch.title, coalesce(note, ''));
  end if;
end $$;

-- ---------- payments ----------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  label text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  due_date timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.payments enable row level security;
create policy "payments read" on public.payments for select using (public.is_staff() or public.is_member(project_id));
create policy "payments staff write" on public.payments for all using (public.is_staff()) with check (public.is_staff());

alter publication supabase_realtime add table public.changes, public.payments, public.project_members;
