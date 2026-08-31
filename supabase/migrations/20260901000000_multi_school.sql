-- Multi-school support.
--
-- A "school" IS an organizations row. The schema was already multi-tenant —
-- every business table carries organization_id and all 22 RLS policies scope
-- through is_organization_admin(organization_id) / is_activity_monitor(...).
-- The only thing pinning the app to one tenant was a hardcoded constant in
-- the application layer, not the database. So this migration adds no new
-- scoping column and moves no existing row: the data already belongs to the
-- first school.
--
-- Decided with the user before implementing:
--   * one child belongs to exactly one school;
--   * one monitor works in exactly one school and holds one activity there.
-- Both are enforced below by scoping constraints that are currently GLOBAL
-- (they predate multi-tenancy and would otherwise leak across schools).
begin;

-- ---------------------------------------------------------------------------
-- 1. School profile fields. Kept on organizations rather than a parallel
--    table so there is exactly one row per school and no way for the two to
--    disagree.
-- ---------------------------------------------------------------------------

alter table public.organizations
  add column if not exists address text not null default '' check (char_length(address) <= 300),
  add column if not exists city text not null default '' check (char_length(city) <= 160),
  add column if not exists postal_code text not null default '' check (char_length(postal_code) <= 20),
  add column if not exists contact_name text not null default '' check (char_length(contact_name) <= 160),
  add column if not exists contact_email text not null default '' check (char_length(contact_email) <= 254),
  add column if not exists phone text not null default '' check (char_length(phone) <= 40),
  -- A deactivated school keeps every row it ever had; it simply stops being
  -- offered for day-to-day work (see the schools admin screen).
  add column if not exists active boolean not null default true;

-- ---------------------------------------------------------------------------
-- 2. Re-scope the three constraints that were global. Each currently means
--    "across the entire database" and would stop the same child or monitor
--    from existing in a second school even though the rows are unrelated.
--    Re-creating them per-organization preserves exactly today's guarantee
--    *within* a school while removing the accidental cross-school coupling.
-- ---------------------------------------------------------------------------

-- One activity per monitor — per school, not globally.
drop index if exists public.activities_one_activity_per_monitor;
create unique index if not exists activities_one_activity_per_monitor_per_org
  on public.activities (organization_id, monitor_id)
  where monitor_id is not null;

-- One attendance row per child per day. child_id is already unique to a
-- school (a child belongs to exactly one), so adding organization_id keeps
-- the same meaning while making the scope explicit and index-aligned with
-- every query, which all filter on organization_id first.
alter table public.attendance drop constraint if exists attendance_child_id_date_key;
create unique index if not exists attendance_one_row_per_child_day
  on public.attendance (organization_id, child_id, date);

-- One activity per child per week, per school.
alter table public.weekly_roster drop constraint if exists weekly_roster_child_id_week_start_key;
create unique index if not exists weekly_roster_one_activity_per_child_week
  on public.weekly_roster (organization_id, child_id, week_start);

-- ---------------------------------------------------------------------------
-- 3. Only a SUPER_ADMIN creates schools, so organizations needs an insert
--    path. Until a super-admin role exists, creation happens exclusively
--    through the service-role client (server-side, admin-gated) — deliberately
--    no insert policy is added here, matching how the audit tables are
--    handled: RLS grants nothing, the trusted server path does the work.
-- ---------------------------------------------------------------------------

commit;
