# Supabase foundation

The full schema lives in [migrations/20260824120000_foundation.sql](migrations/20260824120000_foundation.sql). It supersedes the earlier identity-only placeholder migration.

It creates the data foundation only:

- Supabase-auth-backed profiles and organization-scoped ADMIN / MONITOR memberships;
- children, groups, roster snapshots, sessions and monitor assignments;
- immutable attendance events, a rebuildable current-state projection, audit entries and anomalies;
- tenant-scoped RLS so monitors can read only sessions assigned to them and their roster data.

## Apply it

Link the project to its Supabase instance, then apply migrations with the Supabase CLI:

~~~
supabase db push
~~~

For a local Supabase stack, use:

~~~
supabase start
supabase db reset
~~~

Do not put a Supabase URL, anon key, service-role key, or a database password in this directory or in version control.

## Bootstrap the first administrator

The first organization and its first active ADMIN membership must be created through a trusted server-side provisioning path or the Supabase SQL editor. This is intentional: no browser policy allows an unaffiliated account to create itself as an administrator.

Later attendance commands must run server-side (or as tightly scoped RPCs). They must add an immutable event and update the attendance_records projection in one transaction, using the event's idempotency key. Browser clients have no mutation policy for attendance_events, attendance_records, or audit_logs.
