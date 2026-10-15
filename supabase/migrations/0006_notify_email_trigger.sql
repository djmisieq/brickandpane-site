-- Email every new portal notification: after insert, ask the notify-email Edge Function to send it.
-- pg_net makes the call asynchronously, so a slow or failed email never blocks the change that caused it.
-- Only the notification id is sent; the function reads the rest from the database (see its header).
-- Not part of tests/db (pglite has no pg_net).

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_email_on_insert() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
begin
  perform net.http_post(
    url := 'https://kgnjyyzjmyilorgaeabc.supabase.co/functions/v1/notify-email',
    body := jsonb_build_object('type', 'INSERT', 'record', jsonb_build_object('id', new.id)),
    headers := '{"Content-Type": "application/json"}'::jsonb
  );
  return new;
end $$;

create trigger notifications_email after insert on public.notifications
  for each row execute function public.notify_email_on_insert();
