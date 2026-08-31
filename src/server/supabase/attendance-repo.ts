import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireActiveSchoolId } from "@/lib/schools/context";
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
  daycare_manual: boolean;
}

const ATTENDANCE_COLUMNS = "child_id, activity_id, arrived, arrived_at, departed, departed_at, daycare_manual";

function mapRow(row: AttendanceRow): PresenceRecord {
  return {
    childId: row.child_id,
    activityId: row.activity_id,
    arrived: row.arrived,
    arrivedAt: row.arrived_at ? new Date(row.arrived_at) : null,
    left: row.departed,
    leftAt: row.departed_at ? new Date(row.departed_at) : null,
    daycareManual: row.daycare_manual,
  };
}

/** Only rows that actually exist come back — callers merge against the full
 * children roster themselves so a child never-touched today still shows up
 * as a normal "not arrived" default rather than being silently missing. */
export async function getAttendanceMapForDate(date: Date, activityId?: string): Promise<Map<string, PresenceRecord>> {
  const supabase = getServiceRoleClient();
  let query = supabase
    .from("attendance")
    .select(ATTENDANCE_COLUMNS)
    .eq("organization_id", (await requireActiveSchoolId()))
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
  daycareManual?: boolean;
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
export interface KnownAttendanceState {
  arrived: boolean;
  arrivedAt: Date | null;
  departed: boolean;
  departedAt: Date | null;
  daycareManual: boolean;
}

export async function upsertAttendance(
  childId: string,
  activityId: string,
  date: Date,
  patch: AttendancePatch,
  recordedBy: string | null,
  /**
   * The row's current state, when the caller already read it earlier in
   * this same request. Supplying it skips the SELECT below — worth a full
   * Supabase round trip on the presence-tap path, where the command layer
   * has just resolved this exact row to authorize the write. Omit it and
   * the row is re-read as before.
   */
  known?: KnownAttendanceState,
): Promise<void> {
  const supabase = getServiceRoleClient();
  const dateKey = toDateKey(date);

  let existing: { arrived: boolean; arrived_at: string | null; departed: boolean; departed_at: string | null; daycare_manual: boolean } | null;
  if (known) {
    existing = {
      arrived: known.arrived,
      arrived_at: known.arrivedAt ? known.arrivedAt.toISOString() : null,
      departed: known.departed,
      departed_at: known.departedAt ? known.departedAt.toISOString() : null,
      daycare_manual: known.daycareManual,
    };
  } else {
    const { data, error: fetchError } = await supabase
      .from("attendance")
      .select("arrived, arrived_at, departed, departed_at, daycare_manual")
      .eq("organization_id", (await requireActiveSchoolId()))
      .eq("child_id", childId)
      .eq("date", dateKey)
      .maybeSingle();
    if (fetchError) throw fetchError;
    existing = data;
  }

  const row = {
    organization_id: (await requireActiveSchoolId()),
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
    daycare_manual: patch.daycareManual !== undefined ? patch.daycareManual : (existing?.daycare_manual ?? false),
  };

  const { error } = await supabase.from("attendance").upsert(row, { onConflict: "organization_id,child_id,date" });
  if (error) throw error;
}

/**
 * Bulk "mark these children absent for this date" — used by closure to
 * finalize the roll call. Unlike upsertAttendance this needs no
 * read-then-merge pass: every target here is by definition a child with NO
 * existing row for the date (an untouched child), so there is nothing to
 * preserve and a single multi-row insert is both correct and one round trip
 * instead of two per child.
 *
 * onConflict is still specified defensively: if a monitor marks one of these
 * children in the instant between the caller's read and this write, the
 * ignoreDuplicates option keeps their real action rather than overwriting it
 * with "absent" — the race resolves in favour of the explicit human action.
 */
export async function bulkMarkAbsent(
  entries: Array<{ childId: string; activityId: string }>,
  date: Date,
  recordedBy: string | null,
): Promise<void> {
  if (entries.length === 0) return;
  const supabase = getServiceRoleClient();
  const schoolId = await requireActiveSchoolId();
  const dateKey = toDateKey(date);
  const rows = entries.map((e) => ({
    organization_id: schoolId,
    child_id: e.childId,
    activity_id: e.activityId,
    date: dateKey,
    recorded_by: recordedBy,
    arrived: false,
    arrived_at: null,
    departed: false,
    departed_at: null,
    daycare_manual: false,
  }));
  const { error } = await supabase.from("attendance").upsert(rows, { onConflict: "organization_id,child_id,date", ignoreDuplicates: true });
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
    .select("child_id, activity_id, date, arrived, arrived_at, departed, departed_at, daycare_manual")
    .eq("organization_id", (await requireActiveSchoolId()))
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
    .select("child_id, activity_id, date, arrived, arrived_at, departed, departed_at, daycare_manual")
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("child_id", childId)
    .order("date", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data.map((row) => ({ ...mapRow(row), date: row.date }));
}
