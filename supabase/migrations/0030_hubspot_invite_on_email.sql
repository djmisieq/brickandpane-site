-- Converting an enquiry always writes a make_owner invite for the enquiry's email (0024), so the client becomes the
-- project's owner when they sign up. That row is a reservation, not an invitation: no email goes out unless staff
-- tick "Email the client an invitation". 0029 announced every invite row, so the deal got "… was invited" for an
-- invitation nobody sent (owner test 11.11.2026, BP-2026-0004).
-- Now: an invite the team adds in Team is announced as before; the conversion's reservation only once its
-- invitation email has actually gone out (invite-email sets emailed_at).
create or replace function public.hubspot_queue_invite() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if new.make_owner and new.emailed_at is null then return new; end if;
    perform public.hubspot_queue('team_invite', new.project_id, new.id);
  elsif new.make_owner and new.emailed_at is not null and old.emailed_at is null then
    perform public.hubspot_queue('team_invite', new.project_id, new.id);
  end if;
  return new;
end $$;
drop trigger if exists project_invites_hubspot_queue on public.project_invites;
create trigger project_invites_hubspot_queue after insert or update of emailed_at on public.project_invites
  for each row execute function public.hubspot_queue_invite();
