-- Fixes a false-positive regression: reset_operational_data emptied
-- weekly_roster without recording anything in weekly_roster_audit_log,
-- so wasWeekEverActivated() (which only looks at that log) kept finding
-- the old "ADD" entry from before the reset and, combined with the now-
-- empty live table, flagged every reset week as a permanent anomaly —
-- exactly the false alarm the anomaly detector was built to avoid, not
-- produce. Reproduced live: resetting the operational data after a test
-- roster entry had been added made the Garderie/Présences pages log
-- "ANOMALIE weekly_roster" on every subsequent load for that week.
--
-- Fix: log one RESET row per affected week (mirroring what
-- resetRosterForActivityWeek already does for a single activity/week)
-- before deleting, so the app layer's updated wasWeekEverActivated() can
-- tell "populated, never touched since" apart from "populated, then
-- legitimately cleared by a reset" (see weekly-roster-repo.ts).
begin;

create or replace function public.reset_operational_data(
  p_organization_id uuid,
  p_actor_id uuid
) returns jsonb
language plpgsql
as $$
declare
  v_attendance_count integer;
  v_day_state_count integer;
  v_roster_count integer;
  v_notifications_count integer;
begin
  select count(*) into v_attendance_count from public.attendance where organization_id = p_organization_id;
  select count(*) into v_day_state_count from public.activity_day_state where organization_id = p_organization_id;
  select count(*) into v_roster_count from public.weekly_roster where organization_id = p_organization_id;
  select count(*) into v_notifications_count from public.notifications where organization_id = p_organization_id;

  -- One RESET audit row per distinct week that actually had participants,
  -- recorded before the rows disappear so wasWeekEverActivated() never
  -- has to guess whether an empty week was cleared on purpose.
  insert into public.weekly_roster_audit_log (organization_id, action, actor_id, week_start, rows_affected, detail)
  select p_organization_id, 'RESET', p_actor_id, week_start, count(*), 'Réinitialisation des données opérationnelles'
  from public.weekly_roster
  where organization_id = p_organization_id
  group by week_start;

  delete from public.attendance where organization_id = p_organization_id;
  delete from public.activity_day_state where organization_id = p_organization_id;
  delete from public.weekly_roster where organization_id = p_organization_id;
  delete from public.notifications where organization_id = p_organization_id;

  insert into public.operational_reset_log (
    organization_id, actor_id, attendance_rows, activity_day_state_rows, weekly_roster_rows, notifications_rows, detail
  ) values (
    p_organization_id, p_actor_id, v_attendance_count, v_day_state_count, v_roster_count, v_notifications_count,
    'Réinitialisation des données opérationnelles'
  );

  return jsonb_build_object(
    'attendance', v_attendance_count,
    'activityDayState', v_day_state_count,
    'weeklyRoster', v_roster_count,
    'notifications', v_notifications_count
  );
end;
$$;

revoke all on function public.reset_operational_data(uuid, uuid) from public;
grant execute on function public.reset_operational_data(uuid, uuid) to service_role;

commit;
