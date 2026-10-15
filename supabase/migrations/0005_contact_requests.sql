-- Quote requests from the public contact form (contact.html).
-- The form posts to the Edge Function contact-submit, which writes here with the service role,
-- so the public (anon) role gets no access at all. Staff read and triage them.

create table public.contact_requests (
  id uuid primary key default gen_random_uuid(),
  ref text unique not null default ('BP-' || to_char(now(), 'YYMMDD') || '-' || upper(substr(md5(gen_random_uuid()::text), 1, 4))),
  created_at timestamptz not null default now(),
  status text not null default 'new' check (status in ('new', 'replied', 'converted', 'closed', 'spam')),
  lang text not null default 'en',
  role text,
  name text not null check (length(name) between 1 and 200),
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone text,
  company text,
  topic text,
  systems text[] not null default '{}',
  material text[] not null default '{}',
  location text,
  riba_stage text,
  building text,
  units text,
  start text,
  opening_width_mm int check (opening_width_mm between 0 and 100000),
  opening_height_mm int check (opening_height_mm between 0 and 100000),
  message text check (length(message) <= 10000),
  files text[] not null default '{}',   -- paths in the private bucket "enquiries": <request id>/<file name>
  files_link text check (files_link ~* '^https?://' and length(files_link) <= 1000),  -- WeTransfer/Dropbox/Drive link for sets over the upload limit
  consent_at timestamptz not null,
  project_id uuid references public.projects (id) on delete set null,  -- set when staff turn it into a portal project
  staff_note text
);
create index contact_requests_new on public.contact_requests (created_at desc) where status = 'new';

alter table public.contact_requests enable row level security;
create policy "requests staff read" on public.contact_requests for select using (public.is_staff());
create policy "requests staff update" on public.contact_requests for update using (public.is_staff()) with check (public.is_staff());

-- Private bucket for drawings sent with a request. 50 MB per file, as the form says.
insert into storage.buckets (id, name, public, file_size_limit)
values ('enquiries', 'enquiries', false, 52428800)
on conflict (id) do nothing;
create policy "enquiry files staff read" on storage.objects for select using (bucket_id = 'enquiries' and public.is_staff());
