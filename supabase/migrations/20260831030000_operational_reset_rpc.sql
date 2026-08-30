-- Atomic operational reset: empties attendance, activity_day_state,
-- weekly_roster, and notifications for the organization in a single
-- transaction, logging exact counts to operational_reset_log before
-- deleting anything. Never touches children, activities, profiles,
-- organization_memberships, or organizations — those are the permanent
-- structure the app needs to keep functioning and are asserted untouched
-- by the caller's own pre/post verification, not by this function (a
-- function that only ever deletes from four specific tables cannot
-- accidentally reach any other table).
--
-- No FK ordering constraints apply among these four deletes: none of them
-- reference each other, so nothing here can hit a restrict violation.
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

-- SECURITY INVOKER (the default): only the server's service-role client
-- ever calls this, and service_role already bypasses RLS by role
-- attribute — no elevated-privilege function needed.
revoke all on function public.reset_operational_data(uuid, uuid) from public;
grant execute on function public.reset_operational_data(uuid, uuid) to service_role;

commit;
