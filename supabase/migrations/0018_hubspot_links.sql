-- Portal ↔ HubSpot IDs (one way: the portal tells HubSpot; nothing comes back). The hubspot-link Edge Function
-- writes the deal id of a converted enquiry's project and the contact id of a confirmed account, and stamps the
-- HubSpot records with bp_portal_*. The ids live in staff-only tables, so clients never see them: project_internal
-- (already staff-only) and a new profile_internal. pg_net calls the function asynchronously; a failed call never
-- blocks a conversion, a stage change or a sign-up. No create extension here (0006 has pg_net), so tests/db runs it.

alter table public.project_internal add column if not exists hubspot_deal_id text;
create index if not exists project_internal_hubspot_deal on public.project_internal (hubspot_deal_id) where hubspot_deal_id is not null;

create table if not exists public.profile_internal (
  profile_id uuid primary key references public.profiles (id) on delete cascade,
  hubspot_contact_id text,
  updated_at timestamptz not null default now()
);
create index if not exists profile_internal_hubspot_contact on public.profile_internal (hubspot_contact_id) where hubspot_contact_id is not null;
alter table public.profile_internal enable row level security;
create policy "profile internal staff only" on public.profile_internal for select using (public.is_staff());
revoke insert, update, delete on public.profile_internal from anon, authenticated;

create or replace function public.hubspot_link(body jsonb) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/hubspot-link',
    body := body,
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
exception when others then null; -- HubSpot is a copy; never let it break the change that triggered it
end $$;
revoke execute on function public.hubspot_link(jsonb) from public, anon, authenticated;

-- An enquiry became a project (convert_request), or a linked project moved stage (bp_portal_stage mirror).
create or replace function public.hubspot_link_request() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  perform public.hubspot_link(jsonb_build_object('project_id', new.project_id));
  return new;
end $$;
drop trigger if exists contact_requests_hubspot_link on public.contact_requests;
create trigger contact_requests_hubspot_link after update of project_id on public.contact_requests
  for each row when (old.project_id is null and new.project_id is not null)
  execute function public.hubspot_link_request();

create or replace function public.hubspot_link_project() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.contact_requests where project_id = new.id) then
    perform public.hubspot_link(jsonb_build_object('project_id', new.id));
  end if;
  return new;
end $$;
drop trigger if exists projects_hubspot_link on public.projects;
create trigger projects_hubspot_link after update of stage on public.projects
  for each row when (old.stage is distinct from new.stage)
  execute function public.hubspot_link_project();

-- An account's email is confirmed: at sign-up for Google/Microsoft, on the confirmation link for email sign-ups.
create or replace function public.hubspot_link_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.email_confirmed_at is null or (tg_op = 'UPDATE' and old.email_confirmed_at is not null) then return new; end if;
  perform public.hubspot_link(jsonb_build_object('profile_id', new.id));
  return new;
end $$;
drop trigger if exists auth_users_hubspot_link on auth.users;
create trigger auth_users_hubspot_link after insert or update of email_confirmed_at on auth.users
  for each row execute function public.hubspot_link_user();
