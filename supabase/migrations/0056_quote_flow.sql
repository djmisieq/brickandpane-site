-- ERP audit 28.11.2026, the document flow after a quotation. Additive only: new columns, a sequence, functions and
-- triggers; no existing row is changed.
--  1. The client's acceptance in the portal is the contract: the quotation it came from becomes "accepted", and the
--     project keeps the accepted amount and when (it no longer moves when another revision is sent).
--  2. An accepted quotation is frozen: its content cannot change (a revision is a copy); it can still be reopened by
--     setting its status back, which is logged.
--  3. Quotation numbers come from the database, so two people never get the same one.
--  4. An order to a supplier: a PO number from a sequence, when it was placed and by whom, when the supplier
--     confirmed, and the delivery date it promised (each change of that date in the history).

-- ---------- 1. acceptance is the contract ----------
alter table public.documents add column if not exists quote_id uuid references public.quotes (id) on delete set null;
alter table public.project_internal
  add column if not exists contract_gbp numeric(12, 2),
  add column if not exists contract_doc uuid references public.documents (id) on delete set null,
  add column if not exists contract_at timestamptz;
alter table public.quotes drop constraint if exists quotes_status_source_check;
alter table public.quotes add constraint quotes_status_source_check check (status_source is null or status_source in ('crm', 'hubspot', 'portal'));

create or replace function public.quote_accepted() returns trigger
language plpgsql security definer set search_path = public as $$
declare doc public.documents;
begin
  select * into doc from public.documents where id = new.document_id;
  if doc.kind <> 'quote' or new.decision <> 'approved' then return null; end if;
  update public.project_internal set contract_gbp = doc.amount, contract_doc = doc.id, contract_at = new.created_at
    where project_id = doc.project_id;
  if doc.quote_id is not null then
    update public.quotes set status = 'accepted', status_source = 'portal', status_at = new.created_at where id = doc.quote_id;
  end if;
  insert into public.crm_log (project_id, entity, entity_id, field, old_val, new_val, actor_id)
    values (doc.project_id, 'project', doc.project_id, 'contract_gbp', null, doc.amount::text, new.actor_id);
  return null;
end $$;
revoke execute on function public.quote_accepted() from public, anon, authenticated;
drop trigger if exists quote_accepted on public.approvals;
create trigger quote_accepted after insert on public.approvals for each row execute function public.quote_accepted();

-- ---------- 2. an accepted quotation is frozen ----------
create or replace function public.quote_frozen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return new; end if;
  if old.status = 'accepted' and new.status = 'accepted' and (new.data is distinct from old.data or new.reference is distinct from old.reference) then
    raise exception 'This quotation is accepted, so it no longer changes. Make a copy for a revision.';
  end if;
  return new;
end $$;
revoke execute on function public.quote_frozen() from public, anon, authenticated;
drop trigger if exists quote_frozen on public.quotes;
create trigger quote_frozen before update on public.quotes for each row execute function public.quote_frozen();

-- ---------- 3. quotation numbers ----------
-- BP-<year>-NNN as before, the next one after every quotation of that year in the table (not only those loaded).
create or replace function public.next_quote_reference() returns text
language plpgsql security definer set search_path = public as $$
declare y text := to_char(now() at time zone 'Europe/London', 'YYYY'); n int;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  perform pg_advisory_xact_lock(hashtext('quote_reference'));
  select coalesce(max((regexp_match(reference, '^BP-' || y || '-(\d+)$'))[1]::int), 0) into n from public.quotes;
  -- A number handed out is reserved for a few minutes, so two people asking at once get different ones.
  n := greatest(n, coalesce((select max(n2) from public.quote_reference_holds where year = y and held_at > now() - interval '10 minutes'), 0)) + 1;
  insert into public.quote_reference_holds (year, n2) values (y, n);
  return 'BP-' || y || '-' || lpad(n::text, 3, '0');
end $$;
create table if not exists public.quote_reference_holds (year text not null, n2 int not null, held_at timestamptz not null default now(), primary key (year, n2));
alter table public.quote_reference_holds enable row level security;
revoke all on public.quote_reference_holds from anon, authenticated;
revoke all on function public.next_quote_reference() from public, anon;
grant execute on function public.next_quote_reference() to authenticated;

-- ---------- 4. orders to suppliers ----------
create sequence if not exists public.purchase_order_seq;
alter table public.supplier_quotes
  add column if not exists po_number text unique,
  add column if not exists ordered_at timestamptz,
  add column if not exists ordered_by uuid references public.profiles (id) on delete set null,
  add column if not exists confirmed_on date,
  add column if not exists eta date;
grant update (confirmed_on, eta) on public.supplier_quotes to authenticated;

create or replace function public.place_order(sq uuid) returns text
language plpgsql security definer set search_path = public as $$
declare r public.supplier_quotes; po text;
begin
  if not public.is_staff() then raise exception 'Staff only.'; end if;
  select * into r from public.supplier_quotes where id = sq for update;
  if r.id is null then raise exception 'Supplier quote not found.'; end if;
  if r.po_number is not null then return r.po_number; end if;
  if r.status <> 'accepted' then raise exception 'Accept the supplier quote before ordering.'; end if;
  po := 'PO-' || to_char(now() at time zone 'Europe/London', 'YYYY') || '-' || lpad(nextval('public.purchase_order_seq')::text, 4, '0');
  update public.supplier_quotes set po_number = po, ordered_at = now(), ordered_by = auth.uid() where id = sq;
  return po;
end $$;
revoke all on function public.place_order(uuid) from public, anon;
grant execute on function public.place_order(uuid) to authenticated;

do $$ begin
  drop trigger if exists crm_log_sq on public.supplier_quotes;
  create trigger crm_log_sq after insert or update or delete on public.supplier_quotes for each row
    execute function public.crm_log_change('project_id', 'supplier_quote', 'id', 'project_id', 'company_id', 'supplier', 'amount', 'currency', 'status', 'po_number', 'confirmed_on', 'eta');
  drop trigger if exists crm_log_internal on public.project_internal;
  create trigger crm_log_internal after update on public.project_internal for each row
    execute function public.crm_log_change('project_id', 'project', 'project_id', 'waiting_on', 'value_gbp', 'probability', 'lost_reason', 'source');
end $$;
