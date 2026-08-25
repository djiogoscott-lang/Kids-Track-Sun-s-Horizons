-- Sun's Horizons — data foundation
--
-- This project's Supabase instance is brand new (no migration has ever been
-- applied to it), so this is a from-scratch schema, not a migration away
-- from live data. It replaces an earlier draft of this same file that
-- modeled a 5-status, session-based attendance system the app never
-- actually adopted — that draft was written before the current
-- Arrivé/Absent/Parti/Garderie model was settled and was never applied
-- anywhere. This version matches the model the app has used since V0.1:
-- two independent per-day facts per child (arrived, left), a daily
-- daycare cutoff, and one monitor per activity.

begin;

create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('ADMIN', 'MONITOR');

-- ---------------------------------------------------------------------------
-- Tenant, identity, and role tables — unchanged in shape from the original
-- draft; nothing about auth/roles needed to change for the new model.
-- ---------------------------------------------------------------------------

create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  time_zone text not null default 'Europe/Brussels'
    check (char_length(btrim(time_zone)) between 1 and 64),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'Member'
    check (char_length(btrim(full_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.organization_memberships (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  user_id uuid not null references public.profiles (id) on delete restrict,
  role public.organization_role not null,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references public.profiles (id) on delete set null,
  revocation_reason text check (
    revocation_reason is null or char_length(btrim(revocation_reason)) between 1 and 500
  ),
  check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or revoked_at is not null
  )
);

create unique index organization_memberships_one_active_membership
  on public.organization_memberships (organization_id, user_id)
  where revoked_at is null;

create index organization_memberships_active_user_idx
  on public.organization_memberships (user_id, organization_id, role)
  where revoked_at is null;

-- ---------------------------------------------------------------------------
-- Activities, children, attendance — the current domain model.
-- ---------------------------------------------------------------------------

-- Exactly one monitor per activity at a time, matching the app's swap-on-
-- reassignment rule (see setActivityMonitor in server/demo/store.ts). The
-- partial unique index allows any number of activities to have no monitor
-- assigned yet, but never lets the same monitor hold two activities.
create table public.activities (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  monitor_id uuid references public.profiles (id) on delete set null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id)
);

create unique index activities_one_activity_per_monitor
  on public.activities (monitor_id)
  where monitor_id is not null;

create table public.children (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  first_name text not null check (char_length(btrim(first_name)) between 1 and 120),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 120),
  activity_id uuid not null,
  -- Registered for daycare from the start of the day, independent of pickup
  -- time — mirrors Child.daycareAuto in the current domain model exactly.
  daycare_auto boolean not null default false,
  active boolean not null default true,
  notes text not null default '' check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, organization_id),
  constraint children_activity_organization_fkey
    foreign key (activity_id, organization_id)
    references public.activities (id, organization_id)
    on delete restrict
);

create index children_activity_idx on public.children (activity_id) where active;

-- One row per child per calendar day — the "date" dimension the in-memory
-- store never had. Today's counters are `where date = current_date`;
-- history is every other row, never deleted. Two independent booleans
-- (arrived, departed) stay the single source of truth: morning/evening/
-- daycare status remain *computed*, never stored redundantly (see
-- features/presence/domain), exactly to avoid the incoherent-counters risk
-- called out in the brief — a stored "status" column duplicating these two
-- booleans could drift out of sync with them.
create table public.attendance (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  child_id uuid not null,
  activity_id uuid not null,
  date date not null default current_date,
  arrived boolean not null default false,
  arrived_at timestamptz,
  departed boolean not null default false,
  departed_at timestamptz,
  recorded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (arrived_at is null or arrived),
  check (not departed or arrived),
  check (departed_at is null or departed),
  unique (child_id, date),
  constraint attendance_child_organization_fkey
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete restrict,
  constraint attendance_activity_organization_fkey
    foreign key (activity_id, organization_id)
    references public.activities (id, organization_id)
    on delete restrict
);

create index attendance_activity_date_idx on public.attendance (activity_id, date);
create index attendance_org_date_idx on public.attendance (organization_id, date);

-- Closure is also per (activity, date) now, instead of a single mutable
-- flag with no date — a Monday closure no longer silently also means
-- Tuesday is closed.
create table public.activity_day_state (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  activity_id uuid not null,
  date date not null default current_date,
  closed boolean not null default false,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  check (
    (closed and closed_at is not null)
    or (not closed and closed_at is null and closed_by is null)
  ),
  unique (activity_id, date),
  constraint activity_day_state_activity_organization_fkey
    foreign key (activity_id, organization_id)
    references public.activities (id, organization_id)
    on delete restrict
);

create table public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  activity_id uuid not null,
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  constraint notifications_activity_organization_fkey
    foreign key (activity_id, organization_id)
    references public.activities (id, organization_id)
    on delete restrict
);

create index notifications_activity_created_idx on public.notifications (activity_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Trusted utility functions and triggers
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles (id, full_name)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(new.email, '@', 1), ''),
      'Member'
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
  for each row execute procedure public.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
  for each row execute procedure public.set_updated_at();
create trigger activities_set_updated_at before update on public.activities
  for each row execute procedure public.set_updated_at();
create trigger children_set_updated_at before update on public.children
  for each row execute procedure public.set_updated_at();
create trigger attendance_set_updated_at before update on public.attendance
  for each row execute procedure public.set_updated_at();

-- Security-definer predicates avoid recursive RLS evaluation while staying
-- scoped to auth.uid(). Fixed search_path, no caller-supplied SQL.
create or replace function public.is_active_organization_member(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.revoked_at is null
  );
$$;

create or replace function public.is_organization_admin(target_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = target_organization_id
      and membership.user_id = auth.uid()
      and membership.role = 'ADMIN'
      and membership.revoked_at is null
  );
$$;

create or replace function public.is_activity_monitor(target_activity_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.activities as activity
    where activity.id = target_activity_id
      and activity.monitor_id = auth.uid()
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security — admins see and manage everything in their
-- organization; monitors are scoped to the one activity they're assigned to.
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.activities enable row level security;
alter table public.children enable row level security;
alter table public.attendance enable row level security;
alter table public.activity_day_state enable row level security;
alter table public.notifications enable row level security;

create policy organizations_read_active_membership
  on public.organizations for select
  using (public.is_active_organization_member(id));

create policy organizations_update_administrators
  on public.organizations for update
  using (public.is_organization_admin(id))
  with check (public.is_organization_admin(id));

create policy profiles_read_self_or_shared_org
  on public.profiles for select
  using (
    id = auth.uid()
    or exists (
      select 1
      from public.organization_memberships as mine
      join public.organization_memberships as theirs
        on theirs.organization_id = mine.organization_id
      where mine.user_id = auth.uid()
        and mine.revoked_at is null
        and theirs.user_id = profiles.id
        and theirs.revoked_at is null
    )
  );

create policy profiles_update_self
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

create policy memberships_read_self_or_administrators
  on public.organization_memberships for select
  using (user_id = auth.uid() or public.is_organization_admin(organization_id));

create policy memberships_insert_administrators
  on public.organization_memberships for insert
  with check (public.is_organization_admin(organization_id));

create policy memberships_update_administrators
  on public.organization_memberships for update
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy activities_read_org_members
  on public.activities for select
  using (public.is_active_organization_member(organization_id));

create policy activities_write_administrators
  on public.activities for all
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy children_read_org_members
  on public.children for select
  using (public.is_active_organization_member(organization_id));

create policy children_write_administrators
  on public.children for all
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy attendance_read_scope
  on public.attendance for select
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

create policy attendance_write_scope
  on public.attendance for all
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  )
  with check (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

create policy activity_day_state_read_scope
  on public.activity_day_state for select
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

create policy activity_day_state_write_scope
  on public.activity_day_state for all
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  )
  with check (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

create policy notifications_read_scope
  on public.notifications for select
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

create policy notifications_insert_administrators
  on public.notifications for insert
  with check (public.is_organization_admin(organization_id));

create policy notifications_update_scope
  on public.notifications for update
  using (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  )
  with check (
    public.is_organization_admin(organization_id)
    or public.is_activity_monitor(activity_id)
  );

-- ---------------------------------------------------------------------------
-- Realtime — presence and notifications push to connected clients the
-- moment a row changes, replacing the need for the custom SSE bus once the
-- app reads from Postgres instead of the in-memory demo store.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.attendance;
alter publication supabase_realtime add table public.activity_day_state;
alter publication supabase_realtime add table public.notifications;

-- ---------------------------------------------------------------------------
-- Seed: the real organization and its four real activities. No children are
-- seeded — those get entered for real through the admin "Enfants" screen,
-- same as the plan already documented in the README. Monitors are left
-- unassigned (monitor_id null) until real accounts exist for them.
-- ---------------------------------------------------------------------------

insert into public.organizations (id, name)
values ('00000000-0000-0000-0000-000000000001', 'Sun''s Horizons ASBL');

insert into public.activities (organization_id, name) values
  ('00000000-0000-0000-0000-000000000001', 'Danse'),
  ('00000000-0000-0000-0000-000000000001', 'Multisport'),
  ('00000000-0000-0000-0000-000000000001', 'Vélo'),
  ('00000000-0000-0000-0000-000000000001', 'Baby Tennis');

commit;
