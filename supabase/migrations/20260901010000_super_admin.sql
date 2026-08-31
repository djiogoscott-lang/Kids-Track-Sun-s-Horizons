-- SUPER_ADMIN: the cross-school role.
--
-- Deliberately NOT a value in organization_role. That enum lives on
-- organization_memberships, which is by definition a link to ONE school —
-- so a "super admin" membership would have to be attached to some arbitrary
-- school to exist at all, and would then have to be ignored by every
-- school-scoped query. A super admin is a property of the person, not of
-- their relationship to one school, so it belongs on profiles.
--
-- What it grants: creating schools, and seeing every school in the picker.
-- It does NOT bypass school scoping inside a school's data — a super admin
-- still works one school at a time, exactly like an admin, so the isolation
-- guarantees are unchanged.
begin;

alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select coalesce((select p.is_super_admin from public.profiles p where p.id = auth.uid()), false);
$$;

-- Super admins may read every school, so the picker can list schools they
-- have no membership in yet. Everything *inside* a school stays governed by
-- the existing per-table policies, which are unchanged.
drop policy if exists organizations_read_super_admin on public.organizations;
create policy organizations_read_super_admin
  on public.organizations for select
  using (public.is_super_admin());

-- School creation happens through the service-role client behind a
-- super-admin check in the application layer, matching how every other
-- privileged write in this app works. No insert policy is added here on
-- purpose: RLS grants nothing, the trusted server path does the work.

commit;
