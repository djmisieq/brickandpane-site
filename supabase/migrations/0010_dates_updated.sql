-- The dates email says "updated", not "confirmed": staff may enter a provisional date (20.10.2026).
create or replace function public.on_dates_changed() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.delivery_at is distinct from old.delivery_at or new.install_at is distinct from old.install_at then
    perform public.notify_members(new.id, 'dates', new.name || ': dates updated',
      concat_ws(' · ', 'Delivery ' || to_char(new.delivery_at, 'Dy DD Mon'), 'Fitting ' || to_char(new.install_at, 'Dy DD Mon')));
  end if;
  return new;
end $$;
