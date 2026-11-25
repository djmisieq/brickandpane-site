-- The one-off HubSpot import (owner 25.11.2026: import everything): where a company came from, so the ~1000
-- companies of the cold campaign list stay apart from the ones the team works with. Additive only.
alter table public.companies add column if not exists source text
  check (source in ('website', 'email', 'phone', 'referral', 'repeat', 'cold', 'other'));
create index if not exists companies_source on public.companies (source);
