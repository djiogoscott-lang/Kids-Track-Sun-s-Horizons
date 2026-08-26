-- Marks children created by the demo seed so they can be told apart from
-- real children and cleaned up later without touching real data. Idempotent:
-- safe to run again if this migration is ever re-applied.
alter table public.children
  add column if not exists is_demo boolean not null default false;
