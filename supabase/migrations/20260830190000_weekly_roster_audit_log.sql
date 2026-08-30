-- Minimal audit trail for weekly_roster mutations, added after an incident
-- where the table was found unexpectedly empty during testing with no way
-- to reconstruct who/what/when. Every sensitive write (add, remove, reset,
-- duplicate, import, backfill) is logged here by the server layer using the
-- service-role client — never client-writable, so it cannot be tampered with
-- from the app itself. Read-only for admins; nobody can insert/update/delete
-- through RLS, matching "audit log" semantics (only the trusted server path
-- populates it).
begin;

create table public.weekly_roster_audit_log (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  action text not null check (action in ('ADD', 'REMOVE', 'RESET', 'DUPLICATE', 'IMPORT', 'BACKFILL')),
  actor_id uuid references public.profiles (id) on delete set null,
  week_start date not null,
  week_end date,
  activity_id uuid references public.activities (id) on delete set null,
  rows_affected integer not null default 0,
  detail text,
  created_at timestamptz not null default now()
);

create index weekly_roster_audit_log_week_idx on public.weekly_roster_audit_log (organization_id, week_start);

alter table public.weekly_roster_audit_log enable row level security;

create policy weekly_roster_audit_log_read_admin
  on public.weekly_roster_audit_log for select
  using (public.is_organization_admin(organization_id));

-- Deliberately no insert/update/delete policy for any role: only the
-- service-role client (which bypasses RLS entirely) is expected to write
-- here, from the server-side repo functions. Neither admins nor monitors can
-- write or erase audit rows through the app or a direct authenticated query.

commit;
