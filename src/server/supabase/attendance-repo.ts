import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";
import type { PresenceRecord } from "@/features/presence/domain/types";

/** Attendance dates are calendar dates in the org's timezone, not UTC — a
 * child marked present at 23:50 local time must land on today, not tomorrow. */
export function toDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(date);
}

interface AttendanceRow {
  child_id: string;
  activity_id: string;
  arrived: boolean;
  arrived_at: string | null;
  departed: boolean;
  departed_at: string | null;
}

function mapRow(row: AttendanceRow): PresenceRecord {
  return {
    childId: row.child_id,
    activityId: row.activity_id,
    arrived: row.arrived,
    arrivedAt: row.arrived_at ? new Date(row.arrived_at) : null,
    left: row.departed,
    leftAt: row.departed_at ? new Date(row.departed_at) : null,
  };
}

/** Only rows that actually exist come back — callers merge against the full
 * children roster themselves so a child never-touched today still shows up
 * as a normal "not arrived" default rather than being silently missing. */
export async function getAttendanceMapForDate(date: Date, activityId?: string): Promise<Map<string, PresenceRecord>> {
  const supabase = getServiceRoleClient();
  let query = supabase
    .from("attendance")
    .select("child_id, activity_id, arrived, arrived_at, departed, departed_at")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("date", toDateKey(date));
  if (activityId) query = query.eq("activity_id", activityId);
  const { data, error } = await query;
  if (error) throw error;
  return new Map(data.map((row) => [row.child_id, mapRow(row)]));
}

export interface AttendancePatch {
  arrived?: boolean;
  arrivedAt?: Date | null;
  departed?: boolean;
  departedAt?: Date | null;
}

export async function upsertAttendance(
  childId: string,
  activityId: string,
  date: Date,
  patch: AttendancePatch,
  recordedBy: string | null,
): Promise<void> {
  const supabase = getServiceRoleClient();
  const row: Record<string, unknown> = {
    organization_id: ORGANIZATION_ID,
    child_id: childId,
    activity_id: activityId,
    date: toDateKey(date),
    recorded_by: recordedBy,
  };
  if (patch.arrived !== undefined) row.arrived = patch.arrived;
  if (patch.arrivedAt !== undefined) row.arrived_at = patch.arrivedAt ? patch.arrivedAt.toISOString() : null;
  if (patch.departed !== undefined) row.departed = patch.departed;
  if (patch.departedAt !== undefined) row.departed_at = patch.departedAt ? patch.departedAt.toISOString() : null;

  const { error } = await supabase.from("attendance").upsert(row, { onConflict: "child_id,date" });
  if (error) throw error;
}

/** One row per (child, date) across a range — used for weekly summaries and
 * per-child history, where per-day queries would be far too chatty. */
export async function getAttendanceForDateRange(
  startDate: Date,
  endDate: Date,
  activityId?: string,
): Promise<Array<{ childId: string; activityId: string; date: string } & PresenceRecord>> {
  const supabase = getServiceRoleClient();
  let query = supabase
    .from("attendance")
    .select("child_id, activity_id, date, arrived, arrived_at, departed, departed_at")
    .eq("organization_id", ORGANIZATION_ID)
    .gte("date", toDateKey(startDate))
    .lte("date", toDateKey(endDate))
    .order("date", { ascending: true });
  if (activityId) query = query.eq("activity_id", activityId);
  const { data, error } = await query;
  if (error) throw error;
  return data.map((row) => ({ ...mapRow(row), date: row.date }));
}

export async function getAttendanceForChild(childId: string, limit = 60): Promise<Array<{ date: string } & PresenceRecord>> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("attendance")
    .select("child_id, activity_id, date, arrived, arrived_at, departed, departed_at")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("child_id", childId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({ ...mapRow(row), date: row.date }));
}
