-- Sun's Horizons — initial Supabase data foundation
--
-- This migration deliberately provides the data boundary only. Attendance
-- commands are introduced later through trusted server-side code/RPCs; browser
-- clients are read-only for attendance events and their current-state projection.

begin;

create extension if not exists pgcrypto with schema extensions;

create type public.organization_role as enum ('ADMIN', 'MONITOR');
create type public.session_status as enum ('SCHEDULED', 'ACTIVE', 'CLOSING', 'CLOSED');
create type public.attendance_presence_state as enum (
  'EXPECTED',
  'ABSENT',
  'EXCUSED',
  'PRESENT',
  'LEFT'
);
create type public.arrival_classification as enum ('UNKNOWN', 'ON_TIME', 'LATE');
create type public.attendance_event_type as enum (
  'EXPECTED',
  'ARRIVED',
  'PRESENT',
  'ABSENT',
  'EXCUSED',
  'LEFT',
  'CORRECTION'
);
create type public.anomaly_type as enum (
  'CHILD_STILL_PRESENT',
  'MISSING_DEPARTURE',
  'DEPARTURE_WITHOUT_ARRIVAL',
  'INCONSISTENT_EVENT',
  'SESSION_NOT_CLOSED',
  'MULTIPLE_ATTENDANCE_CHANGES',
  'VERY_LATE_ARRIVAL',
  'ATTENDANCE_COUNT_MISMATCH'
);
create type public.anomaly_severity as enum ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');
create type public.anomaly_status as enum ('OPEN', 'ACKNOWLEDGED', 'RESOLVED');

-- A tenant boundary is present from day one, even though the MVP begins with
-- one organization. Times are stored as timestamptz and rendered in time_zone.
create table public.organizations (
  id uuid primary key default extensions.gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 160),
  time_zone text not null default 'Europe/Brussels'
    check (char_length(btrim(time_zone)) between 1 and 64),
  default_late_after_minutes integer not null default 10
    check (default_late_after_minutes between 0 and 1440),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Authentication credentials remain in auth.users. This table intentionally
-- carries only application-profile information, never a role.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default 'Member'
    check (char_length(btrim(full_name)) between 1 and 160),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The role is organization-scoped. Revoke memberships instead of deleting them
-- so access history can be retained.
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

create table public.groups (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  name text not null check (char_length(btrim(name)) between 1 and 160),
  reference_code text check (
    reference_code is null or char_length(btrim(reference_code)) between 1 and 80
  ),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (id, organization_id)
);

create unique index groups_organization_reference_code_idx
  on public.groups (organization_id, reference_code)
  where reference_code is not null;

create table public.children (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  reference_code text not null check (char_length(btrim(reference_code)) between 1 and 80),
  first_name text not null check (char_length(btrim(first_name)) between 1 and 120),
  last_name text not null check (char_length(btrim(last_name)) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  unique (id, organization_id),
  unique (organization_id, reference_code)
);

-- Only minimal attendance-identification data is kept here. Parent, medical,
-- photo, and other sensitive data are explicitly outside this MVP schema.

create table public.group_enrollments (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  group_id uuid not null,
  child_id uuid not null,
  enrolled_from date not null default current_date,
  enrolled_until date,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  check (enrolled_until is null or enrolled_until >= enrolled_from),
  constraint group_enrollments_group_organization_fkey
    foreign key (group_id, organization_id)
    references public.groups (id, organization_id)
    on delete restrict,
  constraint group_enrollments_child_organization_fkey
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete restrict
);

create index group_enrollments_group_active_idx
  on public.group_enrollments (group_id, enrolled_from, enrolled_until);

create index group_enrollments_child_active_idx
  on public.group_enrollments (child_id, enrolled_from, enrolled_until);

create table public.sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  group_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone text not null default 'Europe/Brussels'
    check (char_length(btrim(time_zone)) between 1 and 64),
  late_after_minutes integer not null default 10
    check (late_after_minutes between 0 and 1440),
  status public.session_status not null default 'SCHEDULED',
  closed_at timestamptz,
  closed_by uuid references public.profiles (id) on delete set null,
  closure_note text check (
    closure_note is null or char_length(btrim(closure_note)) between 1 and 1000
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references public.profiles (id) on delete set null,
  version integer not null default 1 check (version >= 1),
  check (ends_at > starts_at),
  check (
    (status = 'CLOSED' and closed_at is not null and closed_by is not null)
    or (status <> 'CLOSED' and closed_at is null and closed_by is null)
  ),
  constraint sessions_group_organization_fkey
    foreign key (group_id, organization_id)
    references public.groups (id, organization_id)
    on delete restrict,
  unique (id, organization_id)
);

create index sessions_organization_schedule_idx
  on public.sessions (organization_id, starts_at, status);

create index sessions_group_schedule_idx
  on public.sessions (group_id, starts_at);

create table public.session_monitors (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  session_id uuid not null,
  user_id uuid not null references public.profiles (id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles (id) on delete set null,
  unique (session_id, user_id),
  constraint session_monitors_session_organization_fkey
    foreign key (session_id, organization_id)
    references public.sessions (id, organization_id)
    on delete restrict
);

create index session_monitors_user_schedule_idx
  on public.session_monitors (user_id, organization_id, session_id);

-- A participant is the roster snapshot for one particular session. Future
-- group changes must never rewrite a past roster.
create table public.session_participants (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  session_id uuid not null,
  child_id uuid not null,
  source_group_enrollment_id uuid references public.group_enrollments (id) on delete set null,
  rostered_at timestamptz not null default now(),
  rostered_by uuid references public.profiles (id) on delete set null,
  unique (session_id, child_id),
  unique (id, organization_id, session_id, child_id),
  constraint session_participants_session_organization_fkey
    foreign key (session_id, organization_id)
    references public.sessions (id, organization_id)
    on delete restrict,
  constraint session_participants_child_organization_fkey
    foreign key (child_id, organization_id)
    references public.children (id, organization_id)
    on delete restrict
);

create index session_participants_session_idx
  on public.session_participants (session_id, child_id);

-- This table is a rebuildable read projection. It is not the attendance source
-- of truth, and no browser RLS policy grants it write access.
create table public.attendance_records (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  session_id uuid not null,
  child_id uuid not null,
  session_participant_id uuid not null,
  presence_state public.attendance_presence_state not null default 'EXPECTED',
  arrival_classification public.arrival_classification not null default 'UNKNOWN',
  arrived_at timestamptz,
  left_at timestamptz,
  last_event_id uuid,
  version integer not null default 0 check (version >= 0),
  updated_at timestamptz not null default now(),
  unique (session_participant_id),
  constraint attendance_records_participant_scope_fkey
    foreign key (session_participant_id, organization_id, session_id, child_id)
    references public.session_participants (id, organization_id, session_id, child_id)
    on delete restrict,
  check (
    (
      presence_state in ('EXPECTED', 'ABSENT', 'EXCUSED')
      and arrival_classification = 'UNKNOWN'
      and arrived_at is null
      and left_at is null
    )
    or (
      presence_state = 'PRESENT'
      and arrival_classification in ('ON_TIME', 'LATE')
      and arrived_at is not null
      and left_at is null
    )
    or (
      presence_state = 'LEFT'
      and arrival_classification in ('ON_TIME', 'LATE')
      and arrived_at is not null
      and left_at is not null
      and left_at >= arrived_at
    )
  )
);

create index attendance_records_session_state_idx
  on public.attendance_records (session_id, presence_state, arrival_classification);

-- Immutable event journal. An ARRIVED event captures the observed arrival;
-- a following PRESENT event carries the resulting state. Corrections always
-- append an event and retain both the prior and replacement values.
create table public.attendance_events (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  session_id uuid not null,
  child_id uuid not null,
  session_participant_id uuid not null,
  sequence_number bigint not null check (sequence_number > 0),
  event_type public.attendance_event_type not null,
  presence_state_after public.attendance_presence_state,
  arrival_classification public.arrival_classification,
  occurred_at timestamptz not null,
  recorded_at timestamptz not null default now(),
  recorded_by uuid references public.profiles (id) on delete set null,
  recorded_by_name text check (
    recorded_by_name is null or char_length(btrim(recorded_by_name)) between 1 and 160
  ),
  idempotency_key uuid not null,
  event_data jsonb not null default '{}'::jsonb
    check (jsonb_typeof(event_data) = 'object'),
  corrected_event_id uuid,
  previous_value jsonb,
  new_value jsonb,
  correction_reason text,
  unique (session_participant_id, sequence_number),
  unique (session_participant_id, idempotency_key),
  constraint attendance_events_participant_scope_fkey
    foreign key (session_participant_id, organization_id, session_id, child_id)
    references public.session_participants (id, organization_id, session_id, child_id)
    on delete restrict,
  constraint attendance_events_corrected_event_fkey
    foreign key (corrected_event_id)
    references public.attendance_events (id)
    on delete restrict,
  check (recorded_at >= occurred_at),
  check (
    (
      event_type = 'EXPECTED'
      and presence_state_after = 'EXPECTED'
      and arrival_classification is null
    )
    or (
      event_type = 'ABSENT'
      and presence_state_after = 'ABSENT'
      and arrival_classification is null
    )
    or (
      event_type = 'EXCUSED'
      and presence_state_after = 'EXCUSED'
      and arrival_classification is null
    )
    or (
      event_type = 'ARRIVED'
      and presence_state_after is null
      and arrival_classification in ('ON_TIME', 'LATE')
    )
    or (
      event_type = 'PRESENT'
      and presence_state_after = 'PRESENT'
      and arrival_classification in ('ON_TIME', 'LATE')
    )
    or (
      event_type = 'LEFT'
      and presence_state_after = 'LEFT'
      and arrival_classification is null
    )
    or event_type = 'CORRECTION'
  ),
  check (
    (
      event_type = 'CORRECTION'
      and corrected_event_id is not null
      and previous_value is not null
      and new_value is not null
      and jsonb_typeof(previous_value) = 'object'
      and jsonb_typeof(new_value) = 'object'
      and char_length(btrim(correction_reason)) between 1 and 1000
    )
    or (
      event_type <> 'CORRECTION'
      and corrected_event_id is null
      and previous_value is null
      and new_value is null
      and correction_reason is null
    )
  )
);

create index attendance_events_session_recorded_idx
  on public.attendance_events (session_id, recorded_at, sequence_number);

create index attendance_events_participant_occurred_idx
  on public.attendance_events (session_participant_id, occurred_at, sequence_number);

create index attendance_events_corrected_event_idx
  on public.attendance_events (corrected_event_id)
  where corrected_event_id is not null;

alter table public.attendance_records
  add constraint attendance_records_last_event_fkey
  foreign key (last_event_id)
  references public.attendance_events (id)
  on delete restrict;

create table public.audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  actor_id uuid references public.profiles (id) on delete set null,
  actor_name text check (
    actor_name is null or char_length(btrim(actor_name)) between 1 and 160
  ),
  action text not null check (char_length(btrim(action)) between 1 and 120),
  entity_type text not null check (char_length(btrim(entity_type)) between 1 and 120),
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb
    check (jsonb_typeof(metadata) = 'object'),
  recorded_at timestamptz not null default now()
);

create index audit_logs_organization_recorded_idx
  on public.audit_logs (organization_id, recorded_at desc);

create index audit_logs_entity_idx
  on public.audit_logs (organization_id, entity_type, entity_id, recorded_at desc);

create table public.anomalies (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete restrict,
  session_id uuid not null,
  session_participant_id uuid references public.session_participants (id) on delete restrict,
  anomaly_type public.anomaly_type not null,
  severity public.anomaly_severity not null default 'MEDIUM',
  status public.anomaly_status not null default 'OPEN',
  description text not null check (char_length(btrim(description)) between 1 and 2000),
  details jsonb not null default '{}'::jsonb
    check (jsonb_typeof(details) = 'object'),
  detected_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  acknowledged_by uuid references public.profiles (id) on delete set null,
  resolved_at timestamptz,
  resolved_by uuid references public.profiles (id) on delete set null,
  resolution_note text check (
    resolution_note is null or char_length(btrim(resolution_note)) between 1 and 2000
  ),
  updated_at timestamptz not null default now(),
  constraint anomalies_session_organization_fkey
    foreign key (session_id, organization_id)
    references public.sessions (id, organization_id)
    on delete restrict,
  check (
    (status = 'OPEN' and acknowledged_at is null and acknowledged_by is null
      and resolved_at is null and resolved_by is null and resolution_note is null)
    or (status = 'ACKNOWLEDGED' and acknowledged_at is not null and acknowledged_by is not null
      and resolved_at is null and resolved_by is null and resolution_note is null)
    or (status = 'RESOLVED' and resolved_at is not null and resolved_by is not null
      and char_length(btrim(resolution_note)) between 1 and 2000)
  )
);

create index anomalies_open_queue_idx
  on public.anomalies (organization_id, status, severity, detected_at)
  where status <> 'RESOLVED';

create index anomalies_session_idx
  on public.anomalies (session_id, detected_at desc);

-- ---------------------------------------------------------------------------
-- Trusted utility functions and integrity triggers
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

-- Also create profiles for any auth users that predate this migration.
insert into public.profiles (id, full_name)
select
  u.id,
  coalesce(
    nullif(btrim(u.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(u.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(u.email, '@', 1), ''),
    'Member'
  )
from auth.users as u
on conflict (id) do nothing;

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

create or replace function public.prevent_organization_id_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.organization_id is distinct from old.organization_id then
    raise exception 'Organization scope cannot be changed after creation.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_append_only_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% is append-only; % operations are not permitted.', tg_table_name, tg_op
    using errcode = '55000';
end;
$$;

create or replace function public.assert_session_monitor_membership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
    from public.organization_memberships as membership
    where membership.organization_id = new.organization_id
      and membership.user_id = new.user_id
      and membership.revoked_at is null
  ) then
    raise exception 'A session monitor must have an active membership in the session organization.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assert_attendance_record_last_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.last_event_id is not null and not exists (
    select 1
    from public.attendance_events as event
    where event.id = new.last_event_id
      and event.session_participant_id = new.session_participant_id
  ) then
    raise exception 'attendance_records.last_event_id must belong to the same session participant.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assert_correction_event_target()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.event_type = 'CORRECTION' and not exists (
    select 1
    from public.attendance_events as event
    where event.id = new.corrected_event_id
      and event.session_participant_id = new.session_participant_id
  ) then
    raise exception 'A correction must target an event for the same session participant.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create or replace function public.assert_anomaly_scope()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.session_participant_id is not null and not exists (
    select 1
    from public.session_participants as participant
    where participant.id = new.session_participant_id
      and participant.organization_id = new.organization_id
      and participant.session_id = new.session_id
  ) then
    raise exception 'An anomaly participant must belong to the anomaly session and organization.'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger organizations_set_updated_at
  before update on public.organizations
  for each row execute procedure public.set_updated_at();

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger groups_set_updated_at
  before update on public.groups
  for each row execute procedure public.set_updated_at();

create trigger children_set_updated_at
  before update on public.children
  for each row execute procedure public.set_updated_at();

create trigger sessions_set_updated_at
  before update on public.sessions
  for each row execute procedure public.set_updated_at();

create trigger attendance_records_set_updated_at
  before update on public.attendance_records
  for each row execute procedure public.set_updated_at();

create trigger anomalies_set_updated_at
  before update on public.anomalies
  for each row execute procedure public.set_updated_at();

create trigger organization_memberships_organization_immutable
  before update on public.organization_memberships
  for each row execute procedure public.prevent_organization_id_change();

create trigger groups_organization_immutable
  before update on public.groups
  for each row execute procedure public.prevent_organization_id_change();

create trigger children_organization_immutable
  before update on public.children
  for each row execute procedure public.prevent_organization_id_change();

create trigger group_enrollments_organization_immutable
  before update on public.group_enrollments
  for each row execute procedure public.prevent_organization_id_change();

create trigger sessions_organization_immutable
  before update on public.sessions
  for each row execute procedure public.prevent_organization_id_change();

create trigger session_monitors_organization_immutable
  before update on public.session_monitors
  for each row execute procedure public.prevent_organization_id_change();

create trigger session_participants_organization_immutable
  before update on public.session_participants
  for each row execute procedure public.prevent_organization_id_change();

create trigger attendance_records_organization_immutable
  before update on public.attendance_records
  for each row execute procedure public.prevent_organization_id_change();

create trigger attendance_events_organization_immutable
  before update on public.attendance_events
  for each row execute procedure public.prevent_organization_id_change();

create trigger audit_logs_organization_immutable
  before update on public.audit_logs
  for each row execute procedure public.prevent_organization_id_change();

create trigger anomalies_organization_immutable
  before update on public.anomalies
  for each row execute procedure public.prevent_organization_id_change();

create trigger session_monitors_require_active_membership
  before insert or update on public.session_monitors
  for each row execute procedure public.assert_session_monitor_membership();

create trigger attendance_records_last_event_scope
  before insert or update on public.attendance_records
  for each row execute procedure public.assert_attendance_record_last_event();

create trigger attendance_events_correction_scope
  before insert on public.attendance_events
  for each row execute procedure public.assert_correction_event_target();

create trigger attendance_events_append_only
  before update or delete on public.attendance_events
  for each row execute procedure public.prevent_append_only_mutation();

create trigger audit_logs_append_only
  before update or delete on public.audit_logs
  for each row execute procedure public.prevent_append_only_mutation();

create trigger anomalies_participant_scope
  before insert or update on public.anomalies
  for each row execute procedure public.assert_anomaly_scope();

-- Security-definer predicates avoid recursive RLS evaluation while remaining
-- scoped to auth.uid(). They have a fixed search_path and no caller-supplied SQL.
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

create or replace function public.can_view_profile(target_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from public.organization_memberships as caller_membership
    join public.organization_memberships as target_membership
      on target_membership.organization_id = caller_membership.organization_id
    where caller_membership.user_id = auth.uid()
      and caller_membership.role = 'ADMIN'
      and caller_membership.revoked_at is null
      and target_membership.user_id = target_user_id
      and target_membership.revoked_at is null
  );
$$;

create or replace function public.can_view_session(
  target_organization_id uuid,
  target_session_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_organization_admin(target_organization_id)
    or exists (
      select 1
      from public.session_monitors as monitor
      join public.organization_memberships as membership
        on membership.organization_id = monitor.organization_id
       and membership.user_id = monitor.user_id
       and membership.revoked_at is null
      where monitor.organization_id = target_organization_id
        and monitor.session_id = target_session_id
        and monitor.user_id = auth.uid()
    );
$$;

create or replace function public.can_view_group(
  target_organization_id uuid,
  target_group_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_organization_admin(target_organization_id)
    or exists (
      select 1
      from public.sessions as session
      join public.session_monitors as monitor
        on monitor.session_id = session.id
       and monitor.organization_id = session.organization_id
      join public.organization_memberships as membership
        on membership.organization_id = monitor.organization_id
       and membership.user_id = monitor.user_id
       and membership.revoked_at is null
      where session.organization_id = target_organization_id
        and session.group_id = target_group_id
        and monitor.user_id = auth.uid()
    );
$$;

create or replace function public.can_view_child(
  target_organization_id uuid,
  target_child_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select public.is_organization_admin(target_organization_id)
    or exists (
      select 1
      from public.session_participants as participant
      join public.session_monitors as monitor
        on monitor.session_id = participant.session_id
       and monitor.organization_id = participant.organization_id
      join public.organization_memberships as membership
        on membership.organization_id = monitor.organization_id
       and membership.user_id = monitor.user_id
       and membership.revoked_at is null
      where participant.organization_id = target_organization_id
        and participant.child_id = target_child_id
        and monitor.user_id = auth.uid()
    );
$$;

-- ---------------------------------------------------------------------------
-- Row-level security
-- ---------------------------------------------------------------------------

alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.groups enable row level security;
alter table public.children enable row level security;
alter table public.group_enrollments enable row level security;
alter table public.sessions enable row level security;
alter table public.session_monitors enable row level security;
alter table public.session_participants enable row level security;
alter table public.attendance_records enable row level security;
alter table public.attendance_events enable row level security;
alter table public.audit_logs enable row level security;
alter table public.anomalies enable row level security;

create policy profiles_read_self_or_shared_admin_scope
  on public.profiles for select to authenticated
  using (id = auth.uid() or public.can_view_profile(id));

create policy profiles_update_self
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

create policy organizations_read_active_membership
  on public.organizations for select to authenticated
  using (public.is_active_organization_member(id));

create policy organizations_update_administrators
  on public.organizations for update to authenticated
  using (public.is_organization_admin(id))
  with check (public.is_organization_admin(id));

create policy memberships_read_self_or_administrators
  on public.organization_memberships for select to authenticated
  using (user_id = auth.uid() or public.is_organization_admin(organization_id));

create policy memberships_insert_administrators
  on public.organization_memberships for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy memberships_update_administrators
  on public.organization_memberships for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy groups_read_assigned_scope
  on public.groups for select to authenticated
  using (public.can_view_group(organization_id, id));

create policy groups_insert_administrators
  on public.groups for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy groups_update_administrators
  on public.groups for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy children_read_assigned_scope
  on public.children for select to authenticated
  using (public.can_view_child(organization_id, id));

create policy children_insert_administrators
  on public.children for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy children_update_administrators
  on public.children for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

-- Group enrollment history is restricted to administrators. Monitors receive a
-- session roster through session_participants instead of the whole group list.
create policy group_enrollments_read_administrators
  on public.group_enrollments for select to authenticated
  using (public.is_organization_admin(organization_id));

create policy group_enrollments_insert_administrators
  on public.group_enrollments for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy group_enrollments_update_administrators
  on public.group_enrollments for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy sessions_read_assigned_scope
  on public.sessions for select to authenticated
  using (public.can_view_session(organization_id, id));

create policy sessions_insert_administrators
  on public.sessions for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy sessions_update_administrators
  on public.sessions for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy session_monitors_read_assigned_scope
  on public.session_monitors for select to authenticated
  using (public.can_view_session(organization_id, session_id));

create policy session_monitors_insert_administrators
  on public.session_monitors for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy session_monitors_update_administrators
  on public.session_monitors for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy session_participants_read_assigned_scope
  on public.session_participants for select to authenticated
  using (public.can_view_session(organization_id, session_id));

create policy session_participants_insert_administrators
  on public.session_participants for insert to authenticated
  with check (public.is_organization_admin(organization_id));

create policy session_participants_update_administrators
  on public.session_participants for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

create policy attendance_records_read_assigned_scope
  on public.attendance_records for select to authenticated
  using (public.can_view_session(organization_id, session_id));

create policy attendance_events_read_assigned_scope
  on public.attendance_events for select to authenticated
  using (public.can_view_session(organization_id, session_id));

create policy audit_logs_read_administrators
  on public.audit_logs for select to authenticated
  using (public.is_organization_admin(organization_id));

create policy anomalies_read_assigned_scope
  on public.anomalies for select to authenticated
  using (public.can_view_session(organization_id, session_id));

create policy anomalies_update_administrators
  on public.anomalies for update to authenticated
  using (public.is_organization_admin(organization_id))
  with check (public.is_organization_admin(organization_id));

-- Explicit grants complement RLS. The anon role gets no access. Attendance
-- event/audit mutation is intentionally server-side only, even for admins.
revoke all on table
  public.organizations,
  public.profiles,
  public.organization_memberships,
  public.groups,
  public.children,
  public.group_enrollments,
  public.sessions,
  public.session_monitors,
  public.session_participants,
  public.attendance_records,
  public.attendance_events,
  public.audit_logs,
  public.anomalies
from anon, authenticated;

grant select, update on public.profiles to authenticated;
grant select, update on public.organizations to authenticated;
grant select, insert, update on public.organization_memberships to authenticated;
grant select, insert, update on public.groups to authenticated;
grant select, insert, update on public.children to authenticated;
grant select, insert, update on public.group_enrollments to authenticated;
grant select, insert, update on public.sessions to authenticated;
grant select, insert, update on public.session_monitors to authenticated;
grant select, insert, update on public.session_participants to authenticated;
grant select on public.attendance_records to authenticated;
grant select on public.attendance_events to authenticated;
grant select on public.audit_logs to authenticated;
grant select, update on public.anomalies to authenticated;

revoke all on function
  public.handle_new_user(),
  public.set_updated_at(),
  public.prevent_organization_id_change(),
  public.prevent_append_only_mutation(),
  public.assert_session_monitor_membership(),
  public.assert_attendance_record_last_event(),
  public.assert_correction_event_target(),
  public.assert_anomaly_scope()
from public;

revoke all on function
  public.is_active_organization_member(uuid),
  public.is_organization_admin(uuid),
  public.can_view_profile(uuid),
  public.can_view_session(uuid, uuid),
  public.can_view_group(uuid, uuid),
  public.can_view_child(uuid, uuid)
from public;

grant execute on function
  public.is_active_organization_member(uuid),
  public.is_organization_admin(uuid),
  public.can_view_profile(uuid),
  public.can_view_session(uuid, uuid),
  public.can_view_group(uuid, uuid),
  public.can_view_child(uuid, uuid)
to authenticated;

comment on table public.attendance_events is
  'Immutable source of truth for attendance. Corrections append a CORRECTION event; they never overwrite history.';

comment on table public.attendance_records is
  'Rebuildable current-state projection from attendance_events. It is deliberately read-only to browser clients.';

comment on column public.sessions.closed_at is
  'Set only by an explicit closure action. No database default creates a fictitious departure or closes a session automatically.';

comment on column public.attendance_events.occurred_at is
  'The real-world time of the event, distinct from server-side recorded_at.';

comment on column public.attendance_events.idempotency_key is
  'Required per participant by the later trusted attendance command path to make retries safe.';

commit;
