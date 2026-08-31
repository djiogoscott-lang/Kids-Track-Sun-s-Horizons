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

type RosterAuditAction = "ADD" | "REMOVE" | "RESET" | "DUPLICATE" | "IMPORT" | "BACKFILL";

/** Fire-and-forget by design relative to the caller's main result: a logging
 * failure must never roll back or mask a roster write that already
 * succeeded. Failures are only surfaced to the server console. */
async function logRosterAudit(entry: {
  action: RosterAuditAction;
  actorId: string | null;
  weekStart: string;
  weekEnd?: string | null;
  activityId?: string | null;
  rowsAffected: number;
  detail?: string;
}): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("weekly_roster_audit_log").insert({
    organization_id: ORGANIZATION_ID,
    action: entry.action,
    actor_id: entry.actorId,
    week_start: entry.weekStart,
    week_end: entry.weekEnd ?? null,
    activity_id: entry.activityId ?? null,
    rows_affected: entry.rowsAffected,
    detail: entry.detail ?? null,
  });
  if (error) console.error("weekly_roster_audit_log insert failed:", error);
}

function assertScope(field: string, value: string | null | undefined): asserts value is string {
  if (!value) {
    throw new Error(`Refus de sécurité : opération weekly_roster sans "${field}" — une portée (semaine/activité/enfant) explicite est obligatoire.`);
  }
}

/**
 * Compares the most recent "populated" event (add/import/duplicate/
 * backfill with at least one row) against the most recent "cleared"
 * event for this week. Only a populate strictly more recent than the last
 * clearing counts as "still activated" — this is what tells "no roster was
 * ever created for this week" and "this week was populated but has since
 * been legitimately emptied" (both expected, safe to fall back to legacy
 * children.activityId) apart from "a roster existed and is now empty with
 * no logged operation to explain it" (anomalous, must not be silently
 * masked). Without this comparison, any week ever populated would be
 * flagged anomalous forever after a legitimate reset, since the old
 * populate row never goes away.
 *
 * "Cleared" deliberately counts REMOVE alongside RESET: emptying a week by
 * clicking "Retirer" on the last participant one at a time is just as
 * legitimate an emptying as hitting "Réinitialiser la liste", and only
 * RESET was counted before — so an admin who removed participants
 * individually got a permanent false anomaly banner on that week.
 */
const ROSTER_POPULATE_ACTIONS = ["ADD", "IMPORT", "DUPLICATE", "BACKFILL"] as const;
const ROSTER_CLEAR_ACTIONS = ["RESET", "REMOVE"] as const;

export async function wasWeekEverActivated(weekStart: string): Promise<boolean> {
  const supabase = getServiceRoleClient();
  const [populate, cleared] = await Promise.all([
    supabase
      .from("weekly_roster_audit_log")
      .select("created_at")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("week_start", weekStart)
      .in("action", ROSTER_POPULATE_ACTIONS as unknown as string[])
      .gt("rows_affected", 0)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from("weekly_roster_audit_log")
      .select("created_at")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("week_start", weekStart)
      .in("action", ROSTER_CLEAR_ACTIONS as unknown as string[])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (populate.error) throw populate.error;
  if (cleared.error) throw cleared.error;
  if (!populate.data) return false;
  if (!cleared.data) return true;
  return new Date(populate.data.created_at) > new Date(cleared.data.created_at);
}

export interface RosterWeekStatus {
  liveCount: number;
  everActivated: boolean;
  isAnomalous: boolean;
}

/** The single source of truth the UI and the resolution layer both use to
 * decide whether an empty roster for a week is normal (never activated) or
 * an anomaly (activated, now empty) worth surfacing explicitly. */
export async function getRosterWeekStatus(weekStart: string): Promise<RosterWeekStatus> {
  const [entries, everActivated] = await Promise.all([getRosterForWeek(weekStart), wasWeekEverActivated(weekStart)]);
  const liveCount = entries.length;
  const isAnomalous = everActivated && liveCount === 0;
  if (isAnomalous) {
    console.error(`ANOMALIE weekly_roster: la semaine ${weekStart} a été activée mais ne contient plus aucune ligne.`);
  }
  return { liveCount, everActivated, isAnomalous };
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
  assertScope("childId", childId);
  assertScope("activityId", activityId);
  assertScope("weekStart", weekStart);
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
  await logRosterAudit({ action: "ADD", actorId: createdBy, weekStart, weekEnd, activityId, rowsAffected: 1 });
}

export async function removeFromRoster(childId: string, weekStart: string, removedBy: string | null = null): Promise<void> {
  assertScope("childId", childId);
  assertScope("weekStart", weekStart);
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_roster")
    .delete()
    .eq("organization_id", ORGANIZATION_ID)
    .eq("child_id", childId)
    .eq("week_start", weekStart)
    .select("id, activity_id");
  if (error) throw error;
  if (data.length > 0) {
    await logRosterAudit({ action: "REMOVE", actorId: removedBy, weekStart, activityId: data[0].activity_id, rowsAffected: data.length });
  }
}

/** Returns the number of rows actually removed, for the confirmation message.
 * activityId and weekStart are both mandatory scope — this can never become
 * an unscoped delete across the whole table (see assertScope). */
export async function resetRosterForActivityWeek(activityId: string, weekStart: string, resetBy: string | null = null): Promise<number> {
  assertScope("activityId", activityId);
  assertScope("weekStart", weekStart);
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("weekly_roster")
    .delete()
    .eq("organization_id", ORGANIZATION_ID)
    .eq("activity_id", activityId)
    .eq("week_start", weekStart)
    .select("id");
  if (error) throw error;
  await logRosterAudit({ action: "RESET", actorId: resetBy, weekStart, activityId, rowsAffected: data.length });
  return data.length;
}

/** Copies every active roster row from one week to another, skipping any
 * child who already has a row for the target week (never overwrites a
 * manual edit already made to the new week). Used by the optional "dupliquer
 * la semaine précédente" convenience — never automatic. */
export async function duplicateRosterWeek(fromWeekStart: string, toWeekStart: string, toWeekEnd: string, createdBy: string | null): Promise<number> {
  assertScope("fromWeekStart", fromWeekStart);
  assertScope("toWeekStart", toWeekStart);
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
  await logRosterAudit({
    action: "DUPLICATE",
    actorId: createdBy,
    weekStart: toWeekStart,
    weekEnd: toWeekEnd,
    rowsAffected: toInsert.length,
    detail: `depuis semaine ${fromWeekStart}`,
  });
  return toInsert.length;
}

export async function bulkAddToRoster(
  entries: Array<{ childId: string; activityId: string }>,
  weekStart: string,
  weekEnd: string,
  createdBy: string | null,
  action: Extract<RosterAuditAction, "IMPORT" | "ADD" | "BACKFILL"> = "IMPORT",
): Promise<void> {
  assertScope("weekStart", weekStart);
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
  await logRosterAudit({ action, actorId: createdBy, weekStart, weekEnd, rowsAffected: rows.length });
}
