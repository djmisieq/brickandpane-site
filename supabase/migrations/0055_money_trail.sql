-- ERP audit 28.11.2026, the P0 items: who sees money, and a trail on everything that moves it.
-- Additive only: new columns, functions, triggers and replaced policies; no existing row is changed.
--  1. Instalments and the client's quotation are for the client's side of a project (owner, client, architect), not
--     for a contractor or an engineer invited to it: they saw the client's price and payment plan.
--  2. The bank details printed on every quotation: who changed them and when, and every member of staff is told
--     (a changed account number on a PDF is the classic way to divert a payment).
--  3. Payments: "paid" is recorded with the date a person enters, by whom; undoing it needs a reason; a paid
--     instalment cannot be edited or deleted quietly. Every change lands in crm_log.
--  4. crm_log also follows documents, approvals, team members, supplier quote amounts, quote status and roles.
--  5. A role is changed only by the service role (the SQL editor), not by any member of staff through the API.

-- ---------- 1. who sees money ----------
create or replace function public.can_see_money(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.is_staff() or exists (select 1 from public.project_members m
    where m.project_id = p and m.user_id = auth.uid() and m.role in ('owner', 'client', 'architect'));
$$;
revoke execute on function public.can_see_money(uuid) from public, anon;
grant execute on function public.can_see_money(uuid) to authenticated;

drop policy if exists "payments read" on public.payments;
create policy "payments read" on public.payments for select using (public.can_see_money(project_id));

drop policy if exists "docs read" on public.documents;
create policy "docs read" on public.documents for select using (
  public.is_staff() or (public.is_member(project_id) and visible_to_client and (kind <> 'quote' or public.can_see_money(project_id))));

drop policy if exists "files read" on storage.objects;
create policy "files read" on storage.objects for select using (
  bucket_id = 'project-files' and (
    public.is_staff() or exists (
      select 1 from public.documents d
      where d.storage_path = name and d.project_id::text = (storage.foldername(name))[1]
        and d.visible_to_client and public.is_member(d.project_id)
        and (d.kind <> 'quote' or public.can_see_money(d.project_id))))
);

-- ---------- 2. the bank details on quotations ----------
alter table public.quote_settings add column if not exists updated_by uuid references public.profiles (id) on delete set null;

create or replace function public.quote_settings_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare f text; o text; n text; who text; changed text[] := '{}';
begin
  new.updated_at := now(); new.updated_by := auth.uid();
  foreach f in array array['accountName', 'bankName', 'sortCode', 'accountNumber', 'legalEntity', 'companyNo', 'vatNo', 'replyEmail', 'phone'] loop
    o := case when tg_op = 'UPDATE' then old.data ->> f end; n := new.data ->> f;
    if coalesce(o, '') is distinct from coalesce(n, '') then
      insert into public.crm_log (project_id, entity, entity_id, field, old_val, new_val, actor_id)
        values (null, 'quote_settings', null, f, o, n, auth.uid());
      if f in ('accountName', 'bankName', 'sortCode', 'accountNumber') and coalesce(o, '') <> '' then changed := changed || f; end if;
    end if;
  end loop;
  if array_length(changed, 1) > 0 then
    select coalesce(nullif(full_name, ''), 'Someone') into who from public.profiles where id = auth.uid();
    insert into public.notifications (user_id, project_id, type, title, body)
      select p.id, null, 'security', 'Bank details on quotations changed',
        coalesce(who, 'The service role') || ' changed the bank details printed on quotations. If this was not agreed, check them before any quotation goes out.'
      from public.profiles p where p.role = 'staff';
  end if;
  return new;
end $$;
revoke execute on function public.quote_settings_guard() from public, anon, authenticated;
drop trigger if exists quote_settings_guard on public.quote_settings;
create trigger quote_settings_guard before insert or update on public.quote_settings for each row execute function public.quote_settings_guard();

-- ---------- 3. payments ----------
alter table public.payments
  add column if not exists paid_by uuid references public.profiles (id) on delete set null,
  add column if not exists paid_note text not null default '' check (length(paid_note) <= 300),
  add column if not exists updated_at timestamptz not null default now();

-- A paid instalment changes only through mark_paid / void_payment (which give a reason); the service role may.
create or replace function public.payments_guard() returns trigger
language plpgsql security definer set search_path = public as $$
declare why text := coalesce(current_setting('bp.payment_reason', true), '');
begin
  if auth.uid() is null then return coalesce(new, old); end if;
  if tg_op = 'DELETE' then
    -- the project itself being deleted takes its instalments with it
    if old.paid_at is not null and why = '' and exists (select 1 from public.projects where id = old.project_id) then
      raise exception 'A paid instalment cannot be deleted. Undo the payment first, with a reason.';
    end if;
    return old;
  end if;
  if old.paid_at is not null and why = '' and (new.paid_at is distinct from old.paid_at or new.amount is distinct from old.amount or new.paid_by is distinct from old.paid_by) then
    raise exception 'A paid instalment changes only through "Undo payment", with a reason.';
  end if;
  if old.paid_at is null and new.paid_at is not null and why = '' then
    raise exception 'Record a payment with its date (Mark paid).';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke execute on function public.payments_guard() from public, anon, authenticated;
drop trigger if exists payments_guard on public.payments;
create trigger payments_guard before update or delete on public.payments for each row execute function public.payments_guard();

create or replace function public.mark_paid(pay uuid, paid_on date, note text default '') returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if paid_on is null then raise exception 'Enter the date the money arrived.'; end if;
  if paid_on > (now() at time zone 'Europe/London')::date then raise exception 'The date the money arrived cannot be in the future.'; end if;
  if paid_on < date '2020-01-01' then raise exception 'Check the date the money arrived.'; end if;
  perform set_config('bp.payment_reason', 'paid', true);
  update public.payments set paid_at = (paid_on + time '12:00') at time zone 'Europe/London', paid_by = auth.uid(), paid_note = left(coalesce(note, ''), 300)
    where id = pay and paid_at is null;
  if not found then raise exception 'This instalment is already paid, or it is gone.'; end if;
  perform set_config('bp.payment_reason', '', true);
end $$;
revoke all on function public.mark_paid(uuid, date, text) from public, anon;
grant execute on function public.mark_paid(uuid, date, text) to authenticated;

create or replace function public.void_payment(pay uuid, reason text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  if length(trim(coalesce(reason, ''))) < 3 then raise exception 'Say why the payment is undone.'; end if;
  perform set_config('bp.payment_reason', trim(reason), true);
  update public.payments set paid_at = null, paid_by = null, paid_note = left('Undone: ' || trim(reason), 300) where id = pay and paid_at is not null;
  if not found then raise exception 'This instalment is not paid.'; end if;
  perform set_config('bp.payment_reason', '', true);
end $$;
revoke all on function public.void_payment(uuid, text) from public, anon;
grant execute on function public.void_payment(uuid, text) to authenticated;

-- ---------- 4. the trail ----------
do $$ begin
  drop trigger if exists crm_log_payments on public.payments;
  create trigger crm_log_payments after insert or update or delete on public.payments for each row
    execute function public.crm_log_change('project_id', 'payment', 'id', 'label', 'amount', 'due_date', 'paid_at', 'paid_note');
  drop trigger if exists crm_log_documents on public.documents;
  create trigger crm_log_documents after insert or update or delete on public.documents for each row
    execute function public.crm_log_change('project_id', 'document', 'id', 'title', 'kind', 'visible_to_client', 'approval');
  drop trigger if exists crm_log_approvals on public.approvals;
  create trigger crm_log_approvals after insert or delete on public.approvals for each row
    execute function public.crm_log_change('project_id', 'approval', 'id', 'decision', 'document_id', 'comment');
  drop trigger if exists crm_log_members on public.project_members;
  create trigger crm_log_members after insert or update or delete on public.project_members for each row
    execute function public.crm_log_change('project_id', 'member', 'user_id', 'role');
  drop trigger if exists crm_log_sq on public.supplier_quotes;
  create trigger crm_log_sq after insert or update or delete on public.supplier_quotes for each row
    execute function public.crm_log_change('project_id', 'supplier_quote', 'id', 'project_id', 'company_id', 'supplier', 'amount', 'currency', 'status');
  drop trigger if exists crm_log_quotes on public.quotes;
  create trigger crm_log_quotes after update on public.quotes for each row
    execute function public.crm_log_change('project_id', 'quote', 'id', 'project_id', 'reference', 'status');
  drop trigger if exists crm_log_internal on public.project_internal;
  create trigger crm_log_internal after update on public.project_internal for each row
    execute function public.crm_log_change('project_id', 'project', 'project_id', 'waiting_on', 'value_gbp', 'probability', 'lost_reason', 'source');
  drop trigger if exists crm_log_roles on public.profiles;
  create trigger crm_log_roles after update of role on public.profiles for each row
    execute function public.crm_log_change('', 'profile', 'id', 'role');
end $$;

-- ---------- 5. roles ----------
create or replace function public.protect_role() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the SQL editor / service role: only it may grant or take away a role.
  if auth.uid() is null then return new; end if;
  if new.role is distinct from old.role then
    raise exception 'A role is changed only by the owner in Supabase, not in the app.';
  end if;
  if public.is_staff() then return new; end if;
  if new.account_type is distinct from old.account_type and not exists (
    select 1 from auth.users u where u.id = old.id and u.created_at > now() - interval '15 minutes') then
    raise exception 'account type can only be changed by staff';
  end if;
  return new;
end $$;

