-- Account types (architect / developer / homeowner) and automatic budget estimates.

alter table public.profiles add column account_type text not null default 'architect'
  check (account_type in ('architect', 'developer', 'homeowner'));

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
  return new;
end $$;

-- Client-side budget estimate captured at submission (a guide for the client, not a quotation).
alter table public.projects add column estimate_low numeric(12, 2), add column estimate_high numeric(12, 2);
