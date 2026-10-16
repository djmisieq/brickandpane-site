-- Quote requests sent through the public form (no account needed) show up in the client portal
-- once the sender has an account with the same, confirmed email address.
-- contact_requests stays closed to clients (RLS: staff only); this function returns just the
-- fields a client may see, and only their own rows.

create or replace function public.my_enquiries()
returns table (id uuid, ref text, created_at timestamptz, status text, topic text, systems text[], project_id uuid)
language sql stable security definer set search_path = public as $$
  select r.id, r.ref, r.created_at, r.status, r.topic, r.systems, r.project_id
  from public.contact_requests r
  join auth.users u on u.id = auth.uid()
  where u.email_confirmed_at is not null
    and lower(r.email) = lower(u.email)
    and r.status <> 'spam'
  order by r.created_at desc
  limit 50
$$;

revoke all on function public.my_enquiries() from public, anon;
grant execute on function public.my_enquiries() to authenticated;
