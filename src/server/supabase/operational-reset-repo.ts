import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireActiveSchoolId } from "@/lib/schools/context";

export interface OperationalResetCounts {
  attendance: number;
  activityDayState: number;
  weeklyRoster: number;
  notifications: number;
}

/** Read-only counts for the confirmation dialog — never deletes anything.
 * Uses the same four tables the reset itself touches, so what the admin
 * sees before confirming is exactly what will be removed. */
export async function getOperationalResetPreview(): Promise<OperationalResetCounts> {
  const supabase = getServiceRoleClient();
  const [attendance, activityDayState, weeklyRoster, notifications] = await Promise.all([
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())),
    supabase.from("activity_day_state").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())),
    supabase.from("weekly_roster").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())),
  ]);
  for (const r of [attendance, activityDayState, weeklyRoster, notifications]) {
    if (r.error) throw r.error;
  }
  return {
    attendance: attendance.count ?? 0,
    activityDayState: activityDayState.count ?? 0,
    weeklyRoster: weeklyRoster.count ?? 0,
    notifications: notifications.count ?? 0,
  };
}

/**
 * A single Postgres function call, not four separate deletes issued from
 * here: eliminates the possibility of a partial reset (one table emptied,
 * another left behind) if a connection drops mid-operation, and logs exact
 * counts to operational_reset_log inside the same transaction as the
 * deletes — the log entry and the deletion always agree, never one without
 * the other. Never touches children, activities, profiles, or
 * organizations — the function body only knows how to delete from four
 * specific tables.
 */
export async function resetOperationalData(actorId: string | null): Promise<OperationalResetCounts> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("reset_operational_data", {
    p_organization_id: (await requireActiveSchoolId()),
    p_actor_id: actorId,
  });
  if (error) throw error;
  const result = data as { attendance: number; activityDayState: number; weeklyRoster: number; notifications: number };
  return {
    attendance: result.attendance ?? 0,
    activityDayState: result.activityDayState ?? 0,
    weeklyRoster: result.weeklyRoster ?? 0,
    notifications: result.notifications ?? 0,
  };
}
