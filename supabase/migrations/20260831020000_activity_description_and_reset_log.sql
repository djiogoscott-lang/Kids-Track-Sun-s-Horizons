-- Supports the new /admin/activities CRUD page: activities.active already
-- existed from the foundation migration but was never exposed anywhere in
-- the app; description is new. Also adds an audit table for the upcoming
-- operational reset, mirroring weekly_roster_audit_log's shape and
-- reasoning — a destructive, org-wide operation needs its own durable,
-- tamper-proof (service-role-only-write) trail distinct from any single
-- table's own history.
begin;

alter table public.activities
  add column if not exists description text not null default '' check (char_length(description) <= 1000);

create table public.operational_reset_log (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  attendance_rows integer not null default 0,
  activity_day_state_rows integer not null default 0,
  weekly_roster_rows integer not null default 0,
  notifications_rows integer not null default 0,
  detail text,
  created_at timestamptz not null default now()
);

alter table public.operational_reset_log enable row level security;

create policy operational_reset_log_read_admin
  on public.operational_reset_log for select
  using (public.is_organization_admin(organization_id));

-- Deliberately no insert/update/delete policy for any role — only the
-- service-role client (from the server-side reset function) ever writes
-- here, same reasoning as weekly_roster_audit_log.

commit;
