import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";
import { toDateKey } from "./attendance-repo";

/** Monday-to-Sunday, matching Postgres's date_trunc('week', ...) used by the
 * migration's backfill — Europe/Brussels, same timezone convention as every
 * other date-keyed table in this app (attendance.date, activity_day_state.date). */
export function weekBounds(date: Date): { weekStart: string; weekEnd: string } {
  const dateKey = toDateKey(date);
  const d = new Date(`${dateKey}T12:00:00`);
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", weekday: "short" }).format(d);
  const offsets: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  const monday = new Date(d);
  monday.setDate(monday.getDate() - (offsets[weekday] ?? 0));
  const sunday = new Date(monday);
  sunday.setDate(sunday.getDate() + 6);
  return { weekStart: toDateKey(monday), weekEnd: toDateKey(sunday) };
}

export interface RosterEntry {
  id: string;
  childId: string;
  activityId: string;
  weekStart: string;
  weekEnd: string;
}

/** One query for the whole organization's roster for a given week — callers
 * scope down to a single activity in memory, so every screen that needs
 * "this activity's roster this week" shares one round trip per request. */
export async function getRosterForWeek(weekStart: string): Promise<RosterEntry[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_roster")
    .select("id, child_id, activity_id, week_start, week_end")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("week_start", weekStart)
    .eq("active", true);
  if (error) throw error;
  return data.map((row) => ({ id: row.id, childId: row.child_id, activityId: row.activity_id, weekStart: row.week_start, weekEnd: row.week_end }));
}

export async function isChildInRoster(childId: string, activityId: string, weekStart: string): Promise<boolean> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_roster")
    .select("id")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("child_id", childId)
    .eq("activity_id", activityId)
    .eq("week_start", weekStart)
    .eq("active", true)
    .maybeSingle();
  if (error) throw error;
  return data !== null;
}

/** Upsert on (child_id, week_start): re-adding an already-present child is a
 * no-op success, and adding a child already on a DIFFERENT activity's roster
 * for that week moves them — a child has exactly one activity per week. */
export async function addToRoster(childId: string, activityId: string, weekStart: string, weekEnd: string, createdBy: string | null): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("weekly_roster").upsert(
    {
      organization_id: ORGANIZATION_ID,
      child_id: childId,
      activity_id: activityId,
      week_start: weekStart,
      week_end: weekEnd,
      active: true,
      created_by: createdBy,
    },
    { onConflict: "child_id,week_start" },
  );
  if (error) throw error;
}

export async function removeFromRoster(childId: string, weekStart: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("weekly_roster")
    .delete()
    .eq("organization_id", ORGANIZATION_ID)
    .eq("child_id", childId)
    .eq("week_start", weekStart);
  if (error) throw error;
}

/** Returns the number of rows actually removed, for the confirmation message. */
export async function resetRosterForActivityWeek(activityId: string, weekStart: string): Promise<number> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_roster")
    .delete()
    .eq("organization_id", ORGANIZATION_ID)
    .eq("activity_id", activityId)
    .eq("week_start", weekStart)
    .select("id");
  if (error) throw error;
  return data.length;
}

/** Copies every active roster row from one week to another, skipping any
 * child who already has a row for the target week (never overwrites a
 * manual edit already made to the new week). Used by the optional "dupliquer
 * la semaine précédente" convenience — never automatic. */
export async function duplicateRosterWeek(fromWeekStart: string, toWeekStart: string, toWeekEnd: string, createdBy: string | null): Promise<number> {
  const supabase = getServiceRoleClient();
  const [source, existingTarget] = await Promise.all([getRosterForWeek(fromWeekStart), getRosterForWeek(toWeekStart)]);
  const alreadyPresent = new Set(existingTarget.map((r) => r.childId));
  const toInsert = source
    .filter((r) => !alreadyPresent.has(r.childId))
    .map((r) => ({
      organization_id: ORGANIZATION_ID,
      child_id: r.childId,
      activity_id: r.activityId,
      week_start: toWeekStart,
      week_end: toWeekEnd,
      active: true,
      created_by: createdBy,
    }));
  if (toInsert.length === 0) return 0;
  const { error } = await supabase.from("weekly_roster").insert(toInsert);
  if (error) throw error;
  return toInsert.length;
}

export async function bulkAddToRoster(
  entries: Array<{ childId: string; activityId: string }>,
  weekStart: string,
  weekEnd: string,
  createdBy: string | null,
): Promise<void> {
  if (entries.length === 0) return;
  const supabase = getServiceRoleClient();
  const rows = entries.map((e) => ({
    organization_id: ORGANIZATION_ID,
    child_id: e.childId,
    activity_id: e.activityId,
    week_start: weekStart,
    week_end: weekEnd,
    active: true,
    created_by: createdBy,
  }));
  const { error } = await supabase.from("weekly_roster").upsert(rows, { onConflict: "child_id,week_start" });
  if (error) throw error;
}
