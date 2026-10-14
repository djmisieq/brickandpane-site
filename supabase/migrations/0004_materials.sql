-- Full product range: each opening records its frame material.
-- Values: alu | timber | pvc | alutimber | '' (not decided yet).
alter table public.openings add column if not exists material text not null default ''
  check (material in ('', 'alu', 'timber', 'pvc', 'alutimber'));
