-- Index sur la clé de tenant pour les deux tables qui n'en avaient pas.
--
-- Every read in the app is scoped by organization_id (requireActiveSchoolId
-- feeds each repository query), but children and activities had no index
-- leading with that column: their unique indexes lead with `id`
-- (id, organization_id), which Postgres cannot use for an
-- organization_id-only filter. Both tables were therefore sequentially
-- scanned on every page load.
--
-- At today's volume (7 activities, ~180 children in one school) a sequential
-- scan is genuinely the faster plan and Postgres will keep choosing it — this
-- migration changes no plan today. It exists so that the plan flips
-- automatically as schools are added, instead of degrading linearly with the
-- number of tenants forever.
--
-- weekly_roster and attendance already have organization_id-leading indexes
-- (unique (organization_id, child_id, …) and (organization_id, date)) and are
-- deliberately left alone.
begin;

create index if not exists children_organization_id_idx on public.children (organization_id);
create index if not exists activities_organization_id_idx on public.activities (organization_id);

commit;
