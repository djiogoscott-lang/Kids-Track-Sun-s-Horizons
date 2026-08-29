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

/**
 * Always reads the existing row and sends a complete merged row, rather than
 * upserting only the patched columns. PostgREST's upsert falls back to each
 * column's table default for anything omitted from the payload — even on
 * the update branch of an existing row — so a partial upsert of just
 * {departed: true} was silently resetting arrived back to its default
 * (false), which then violated the attendance_check1 constraint (a child
 * can't be departed without having arrived) and surfaced as a generic
 * "Une erreur est survenue" on the client despite the child clearly having
 * already arrived. This was caught reproducing "Marquer comme parti" in
 * Garderie against real data — the exact error was a 23514 check-constraint
 * violation, not the departed value ever failing to be recorded.
 */
export async function upsertAttendance(
  childId: string,
  activityId: string,
  date: Date,
  patch: AttendancePatch,
  recordedBy: string | null,
): Promise<void> {
  const supabase = getServiceRoleClient();
  const dateKey = toDateKey(date);

  const { data: existing, error: fetchError } = await supabase
    .from("attendance")
    .select("arrived, arrived_at, departed, departed_at")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("child_id", childId)
    .eq("date", dateKey)
    .maybeSingle();
  if (fetchError) throw fetchError;

  const row = {
    organization_id: ORGANIZATION_ID,
    child_id: childId,
    activity_id: activityId,
    date: dateKey,
    recorded_by: recordedBy,
    arrived: patch.arrived !== undefined ? patch.arrived : (existing?.arrived ?? false),
    arrived_at:
      patch.arrivedAt !== undefined ? (patch.arrivedAt ? patch.arrivedAt.toISOString() : null) : (existing?.arrived_at ?? null),
    departed: patch.departed !== undefined ? patch.departed : (existing?.departed ?? false),
    departed_at:
      patch.departedAt !== undefined ? (patch.departedAt ? patch.departedAt.toISOString() : null) : (existing?.departed_at ?? null),
  };

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
