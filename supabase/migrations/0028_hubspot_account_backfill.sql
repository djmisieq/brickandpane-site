-- An account created BEFORE the client's first enquiry never got bp_portal_account on its HubSpot contact:
-- hubspot_link_user runs when the email is confirmed, and at that moment there is no contact to mark yet
-- (migration 0018, function linkProfile returns 'no contact'). Nothing came back to it once the contact existed.
-- syncEnquiry now asks, right after it has the contact, whether a confirmed account already uses that address.
-- Staff accounts are never marked, exactly as linkProfile has it.
create or replace function public.profile_for_confirmed_email(addr text) returns uuid
language sql security definer set search_path = public, auth as $$
  select p.id from public.profiles p join auth.users u on u.id = p.id
  where u.email_confirmed_at is not null and p.role <> 'staff' and lower(u.email) = lower(trim(addr))
  limit 1
$$;
revoke execute on function public.profile_for_confirmed_email(text) from public, anon, authenticated;
grant execute on function public.profile_for_confirmed_email(text) to service_role;
