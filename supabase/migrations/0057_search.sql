-- Top-CRM audit 28.11.2026: one search over everything the team writes, on the server. Staff only.
-- The palette (Ctrl+K) searched only project, company and person names it had loaded into the browser; emails,
-- notes, messages, openings, tasks and quotations were not searched at all. Additive only: one function.
-- Every word must match (in any of the fields), case and accents aside; each hit says where it was found.

-- Accents folded by hand (no extension needed): ą→a, ł→l, é→e and so on.
create or replace function public.bp_fold(t text) returns text language sql immutable set search_path = public as $$
  select lower(translate(coalesce(t, ''), 'ąćęłńóśźżĄĆĘŁŃÓŚŹŻáàâäãåéèêëíìîïóòôöõúùûüýçñÁÀÂÄÉÈÊËÍÌÎÏÓÒÔÖÚÙÛÜÇÑ', 'acelnoszzACELNOSZZaaaaaaeeeeiiiiooooouuuuycnAAAAEEEEIIIIOOOOUUUUCN'));
$$;

create or replace function public.crm_search(q text, lim int default 30)
returns table (kind text, id uuid, project_id uuid, title text, snippet text, at timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare words text[]; n int := greatest(1, least(coalesce(lim, 30), 100));
begin
  if not public.is_staff() then raise exception 'Staff only.' using errcode = '42501'; end if;
  words := array(select w from unnest(regexp_split_to_array(public.bp_fold(trim(coalesce(q, ''))), '\s+')) w where length(w) >= 2 limit 6);
  if array_length(words, 1) is null then return; end if;
  return query
  with hits as (
    select 'project'::text k, p.id, p.id pid, coalesce(p.ref, '') || ' · ' || p.name t, coalesce(p.location, '') || ' ' || coalesce(p.brief, '') s, p.updated_at a,
           concat_ws(' ', p.ref, p.name, p.location, p.brief) hay from public.projects p
    union all select 'company', c.id, null, c.name, concat_ws(' · ', c.email, c.phone), c.created_at, concat_ws(' ', c.name, c.email, c.phone, c.notes) from public.companies c
    union all select 'person', x.id, null, x.full_name, concat_ws(' · ', x.job_title, x.email, x.phone), x.created_at, concat_ws(' ', x.full_name, x.job_title, x.email, x.phone, x.notes) from public.people x
    union all select 'mail', m.id, m.project_id, coalesce(nullif(m.subject, ''), '(no subject)'), concat_ws(' · ', m.from_name, m.from_addr) || ' — ' || left(coalesce(m.body_text, ''), 400), m.sent_at,
           concat_ws(' ', m.subject, m.from_name, m.from_addr, m.to_addrs, left(coalesce(m.body_text, ''), 20000)) from public.mail_messages m where not coalesce(m.dismissed, false)
    union all select 'message', g.id, g.project_id, case when g.internal then 'Note' else 'Message' end, left(g.body, 400), g.created_at, g.body from public.messages g
    union all select 'task', t.id, t.project_id, t.title, left(coalesce(t.note, ''), 300), t.created_at, concat_ws(' ', t.title, t.note) from public.tasks t
    union all select 'opening', o.id, o.project_id, o.ref, concat_ws(' · ', o.system, o.width_mm::text || '×' || o.height_mm::text, o.notes), o.updated_at, concat_ws(' ', o.ref, o.system, o.notes) from public.openings o
    union all select 'quote', qq.id, qq.project_id, qq.reference, concat_ws(' · ', qq.data ->> 'customerName', qq.data ->> 'siteAddress'), qq.updated_at,
           concat_ws(' ', qq.reference, qq.data ->> 'customerName', qq.data ->> 'email', qq.data ->> 'siteAddress', qq.data ->> 'billingAddress', qq.data ->> 'postcode') from public.quotes qq
  )
  select h.k, h.id, h.pid, h.t, h.s, h.a from hits h
  where (select bool_and(public.bp_fold(h.hay) like '%' || w || '%') from unnest(words) w)
  order by case h.k when 'project' then 0 when 'company' then 1 when 'person' then 2 else 3 end, h.a desc nulls last
  limit n;
end $$;
revoke all on function public.crm_search(text, int) from public, anon;
grant execute on function public.crm_search(text, int) to authenticated;
