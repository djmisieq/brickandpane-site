-- No automatic "next update by" dates and no named technical lead promised to the client (19.10.2026).
-- A new project gets no due date; staff set one by hand when they want the client to see it.
-- The text uses ’ so it matches the portal's Polish translation key.

alter table public.projects alter column next_step set default 'We’ll confirm receipt.';
alter table public.projects alter column due_at drop default;

-- Projects that still carry the old defaults: same text without the promise, and no automatic date.
update public.projects set next_step = 'We’ll confirm receipt.'
  where next_step in ('We''ll confirm receipt and assign a technical lead.', 'We’ll confirm receipt and assign a technical lead.');
update public.projects set due_at = null
  where stage = 'submitted' and due_at is not null and due_at <= created_at + interval '1 day 1 minute';
