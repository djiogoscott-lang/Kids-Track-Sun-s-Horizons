-- Weekly participant roster — separates the permanent children directory
-- (public.children, never emptied) from "who is actually attending which
-- activity this week" (this table). A child keeps exactly one active roster
-- row per week (one activity at a time), independent of children.activity_id
-- which becomes a reference/default only, never authoritative for a given
-- week once a roster exists for it.
begin;

create table public.weekly_roster (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  child_id uuid not null,
  activity_id uuid not null,
  week_start date not null,
  week_end date not null,
  active boolean not null default true,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (week_end = week_start + 6),
  -- One activity per child per week, mirroring the one-activity-per-child
  -- shape children.activity_id already has today, just week-scoped now.
  unique (child_id, week_start),
  constraint weekly_roster_child_organization_fkey
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete restrict,
  constraint weekly_roster_activity_organization_fkey
    foreign key (activity_id, organization_id)
    references public.activities (id, organization_id)
    on delete restrict
);

create index weekly_roster_activity_week_idx
  on public.weekly_roster (activity_id, week_start)
  where active;

create trigger weekly_roster_set_updated_at before update on public.weekly_roster
  for each row execute procedure public.set_updated_at();

alter table public.weekly_roster enable row level security;

-- Same scoping as children_read_scope / children_write_administrators: an
-- admin manages every activity's roster, a monitor may only ever read their
-- own activity's — never write to any roster, matching "aucun moniteur ne
-- peut modifier le roster global."
create policy weekly_roster_read_scope
  on public.weekly_roster for select
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

create policy weekly_roster_write_administrators
  on public.weekly_roster for all
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

-- Backfill: every currently-active child gets a roster row for the current
-- week under their existing (reference) activity, so real activities keep
-- working identically the moment this ships — no visible change at cutover,
-- purely additive infrastructure. Monday-Sunday, matching the app's
-- Europe/Brussels day-key convention used everywhere else (attendance.date,
-- activity_day_state.date).
insert into public.weekly_roster (organization_id, child_id, activity_id, week_start, week_end, created_by)
select
  c.organization_id,
  c.id,
  c.activity_id,
  date_trunc('week', (now() at time zone 'Europe/Brussels'))::date as week_start,
  (date_trunc('week', (now() at time zone 'Europe/Brussels'))::date + 6) as week_end,
  null
from public.children c
where c.active;

commit;
