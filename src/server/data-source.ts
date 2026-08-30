/**
 * Single switch point between the in-memory demo store and Supabase.
 *
 * Two independent flags, two independent dimensions:
 *  - isSupabaseConfigured: where the activity/children ROSTER lives.
 *  - isSupabaseAuthEnabled: whether the CURRENT SESSION is a real Supabase
 *    Auth user or a demo cookie.
 *
 * The monitor/assignment dimension (who is logged in, which activity are
 * they assigned to) cannot migrate ahead of real auth: a demo session's id
 * ("monitor-1") will never match a real Supabase UUID. So monitor identity
 * and activity<->monitor assignment stay on the demo map until
 * isSupabaseAuthEnabled is true, regardless of where the roster itself
 * lives — while data is in Supabase but auth is still demo, each Supabase
 * activity's monitorId is bridged back to its demo counterpart by name
 * (the one thing stable across both representations), so the rest of the
 * app can keep treating activity.monitorId as "whoever can actually act as
 * this activity's monitor right now" without knowing about any of this.
 */
import { cache } from "react";
import { isSupabaseAuthEnabled, isSupabaseConfigured } from "@/lib/env";
import type { PresenceRecord } from "@/features/presence/domain/types";
import { ACTIVITIES, INITIAL_ACTIVITY_MONITORS, MONITORS } from "@/server/demo/data";
import * as demoChildren from "@/server/demo/children-store";
import {
  getActivityAssignments,
  getPresenceRecords as getDemoPresenceRecords,
  setActivityMonitor as setDemoActivityMonitor,
} from "@/server/demo/store";
import { closeActivityDay as closeDemoActivityDay, getActivityDayState as getDemoActivityDayState } from "@/server/demo/activity-day-store";
import * as supaActivities from "@/server/supabase/activities-repo";
import * as supaAttendance from "@/server/supabase/attendance-repo";
import * as supaChildren from "@/server/supabase/children-repo";
import * as supaDayState from "@/server/supabase/activity-day-state-repo";
import * as supaNotifications from "@/server/supabase/notifications-repo";
import * as demoNotifications from "@/server/demo/notifications-store";
import * as supaMonitors from "@/server/supabase/monitors-repo";
import * as supaRoster from "@/server/supabase/weekly-roster-repo";
import { PresenceCommandError } from "@/features/presence/application/errors";

export interface ActivityRecord {
  id: string;
  name: string;
  monitorId: string | null;
}

export interface MonitorRecord {
  id: string;
  name: string;
}

export interface ChildRecord {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  active: boolean;
  notes: string;
  isDemo: boolean;
  createdAt: Date;
}

/**
 * Wrapped in React's cache(): within a single request (a page render or one
 * Server Action call), several independent code paths ask for the same
 * activities roster — e.g. every getActivityDetail() call on /admin/presences
 * (one per activity) used to re-fetch this table from scratch each time.
 * cache() deduplicates by request, never across requests, so this cannot
 * serve stale data between one user's actions and the next.
 */
export const getActivitiesList = cache(async (): Promise<ActivityRecord[]> => {
  if (!isSupabaseConfigured) {
    const assignments = getActivityAssignments();
    return ACTIVITIES.map((a) => ({ id: a.id, name: a.name, monitorId: assignments.get(a.id) ?? null }));
  }

  const activities = await supaActivities.getActivities();
  if (isSupabaseAuthEnabled) return activities;

  const demoAssignments = getActivityAssignments();
  return activities.map((a) => {
    const demoActivityId = ACTIVITIES.find((d) => d.name === a.name)?.id;
    return { ...a, monitorId: (demoActivityId && demoAssignments.get(demoActivityId)) ?? null };
  });
});

export const getMonitorsList = cache(async (): Promise<MonitorRecord[]> => {
  if (isSupabaseAuthEnabled) return supaActivities.getMonitors();
  return MONITORS.map((m) => ({ id: m.id, name: m.name }));
});

export async function setMonitorForActivity(activityId: string, monitorId: string): Promise<void> {
  if (isSupabaseAuthEnabled) return supaActivities.setActivityMonitor(activityId, monitorId);
  // Demo session assigning a demo monitor id: resolve to the matching demo
  // activity by name (activityId here may be a real Supabase UUID) and
  // update the demo map — never write a demo id into Supabase's UUID column.
  if (isSupabaseConfigured) {
    const activities = await supaActivities.getActivities();
    const name = activities.find((a) => a.id === activityId)?.name;
    const demoActivityId = name ? ACTIVITIES.find((a) => a.name === name)?.id : undefined;
    if (demoActivityId) setDemoActivityMonitor(demoActivityId, monitorId);
    return;
  }
  setDemoActivityMonitor(activityId, monitorId);
}

/**
 * Same transitional bridge as getActivitiesList()/setMonitorForActivity():
 * a demo session's user id ("monitor-4") is not a valid UUID, so writing it
 * straight into a Postgres FK column (attendance.recorded_by,
 * activity_day_state.closed_by) fails outright. Once real auth is on, the id
 * is already a real UUID and passes through unchanged. Until then, resolve
 * the demo user to whichever activity they're mapped to, then to that same
 * activity's real Supabase monitor — or null (a legal, honest "unknown") if
 * there isn't one, e.g. the demo admin has no single activity to bridge via.
 */
async function resolveRealUserId(userId: string): Promise<string | null> {
  if (!isSupabaseConfigured || isSupabaseAuthEnabled) return isSupabaseAuthEnabled ? userId : null;
  const demoActivityId = Object.entries(INITIAL_ACTIVITY_MONITORS).find(([, m]) => m === userId)?.[0];
  const demoActivityName = demoActivityId ? ACTIVITIES.find((a) => a.id === demoActivityId)?.name : undefined;
  if (!demoActivityName) return null;
  const realActivities = await supaActivities.getActivities();
  return realActivities.find((a) => a.name === demoActivityName)?.monitorId ?? null;
}

// Demo mode has no created_at/is_demo concept — synthesized here so the rest
// of the app can treat ChildRecord uniformly regardless of backend.
function demoChildToRecord(child: { id: string; firstName: string; lastName: string; activityId: string; daycareAuto: boolean; active: boolean; notes: string }): ChildRecord {
  return { ...child, isDemo: false, createdAt: new Date(0) };
}

export const getChildrenList = cache(async (): Promise<ChildRecord[]> => {
  if (isSupabaseConfigured) return supaChildren.getChildren();
  return demoChildren.getChildren().map(demoChildToRecord);
});

export async function getChildById(childId: string): Promise<ChildRecord | undefined> {
  if (isSupabaseConfigured) return supaChildren.getChild(childId);
  const child = demoChildren.getChild(childId);
  return child ? demoChildToRecord(child) : undefined;
}

export interface NewChildRecordInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
  isDemo?: boolean;
}

export async function createChildRecord(input: NewChildRecordInput): Promise<ChildRecord> {
  if (isSupabaseConfigured) return supaChildren.createChild(input);
  return demoChildToRecord(demoChildren.createChild(input));
}

/** Supabase-only: bulk import has no demo-mode equivalent (demo mode has no
 * persistence story to bulk-load into in the first place). */
export async function bulkCreateChildRecords(inputs: NewChildRecordInput[]): Promise<ChildRecord[]> {
  if (!isSupabaseConfigured) {
    throw new PresenceCommandError("L'import Excel nécessite Supabase.");
  }
  return supaChildren.bulkCreateChildren(inputs);
}

export type ChildRecordUpdate = Partial<Pick<ChildRecord, "firstName" | "lastName" | "activityId" | "daycareAuto" | "notes" | "active">>;

export async function updateChildRecord(childId: string, update: ChildRecordUpdate): Promise<ChildRecord | null> {
  if (isSupabaseConfigured) return supaChildren.updateChild(childId, update);
  const updated = demoChildren.updateChild(childId, update);
  return updated ? demoChildToRecord(updated) : null;
}

/** Supabase-only: physical deletion has no demo-mode equivalent, and demo
 * data was never meant to model deletion protections in the first place. */
export async function deleteChildRecordPermanently(childId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new PresenceCommandError("La suppression définitive nécessite Supabase.");
  }
  try {
    await supaChildren.deleteChildPermanently(childId);
  } catch (error) {
    if (error instanceof supaChildren.ChildHasHistoryError) {
      throw new PresenceCommandError(error.message);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------
// Attendance — the date dimension the demo store never had. Reads are always
// scoped to an explicit date (defaulting to "today"), so the exact same
// functions serve both the live presence screens and the history views.
// Demo mode ignores the date entirely (there is only ever "today" in memory,
// by design — the demo store has never claimed to have real history).
// ---------------------------------------------------------------------------

export interface AttendancePatch {
  arrived?: boolean;
  arrivedAt?: Date | null;
  departed?: boolean;
  departedAt?: Date | null;
  daycareManual?: boolean;
}

export async function getAttendanceMap(date: Date, activityId?: string): Promise<Map<string, PresenceRecord>> {
  if (!isSupabaseConfigured) {
    const records = await getDemoPresenceRecords();
    if (!activityId) return records;
    return new Map([...records].filter(([, r]) => r.activityId === activityId));
  }
  return supaAttendance.getAttendanceMapForDate(date, activityId);
}

export async function setAttendance(
  childId: string,
  activityId: string,
  date: Date,
  patch: AttendancePatch,
  recordedBy: string | null,
): Promise<void> {
  if (!isSupabaseConfigured) {
    const records = await getDemoPresenceRecords();
    const existing = records.get(childId) ?? { childId, activityId, arrived: false, arrivedAt: null, left: false, leftAt: null, daycareManual: false };
    records.set(childId, {
      ...existing,
      activityId,
      arrived: patch.arrived ?? existing.arrived,
      arrivedAt: patch.arrivedAt !== undefined ? patch.arrivedAt : existing.arrivedAt,
      left: patch.departed ?? existing.left,
      leftAt: patch.departedAt !== undefined ? patch.departedAt : existing.leftAt,
      daycareManual: patch.daycareManual ?? existing.daycareManual,
    });
    return;
  }
  const realRecordedBy = recordedBy ? await resolveRealUserId(recordedBy) : null;
  return supaAttendance.upsertAttendance(childId, activityId, date, patch, realRecordedBy);
}

export interface DateAttendanceRow extends PresenceRecord {
  date: string;
}

/** For weekly summaries and per-child history — not meaningful in demo mode
 * (no real history there), returns an empty range rather than pretending. */
export async function getAttendanceForDateRange(startDate: Date, endDate: Date, activityId?: string): Promise<DateAttendanceRow[]> {
  if (!isSupabaseConfigured) return [];
  return supaAttendance.getAttendanceForDateRange(startDate, endDate, activityId);
}

export async function getAttendanceForChild(childId: string, limit = 60): Promise<DateAttendanceRow[]> {
  if (!isSupabaseConfigured) return [];
  return supaAttendance.getAttendanceForChild(childId, limit);
}

// ---------------------------------------------------------------------------
// Activity day state (closure) — same date-scoping story as attendance.
// ---------------------------------------------------------------------------

export interface DayState {
  closed: boolean;
  closedAt: Date | null;
  closedBy: string | null;
}

export async function getDayState(activityId: string, date: Date): Promise<DayState> {
  if (!isSupabaseConfigured) return getDemoActivityDayState(activityId);
  return supaDayState.getDayState(activityId, date);
}

export interface DayStateRow extends DayState {
  activityId: string;
  date: string;
}

export async function getDayStatesForDateRange(startDate: Date, endDate: Date, activityId?: string): Promise<DayStateRow[]> {
  if (!isSupabaseConfigured) return [];
  return supaDayState.getDayStatesForDateRange(startDate, endDate, activityId);
}

/** One query for every activity's state on a single date, instead of one
 * query per activity — used wherever a loop over activities/children would
 * otherwise call getDayState() N times for the same date. */
export async function getDayStatesForDate(date: Date): Promise<Map<string, DayState>> {
  if (!isSupabaseConfigured) {
    const map = new Map<string, DayState>();
    for (const activity of ACTIVITIES) map.set(activity.id, getDemoActivityDayState(activity.id));
    return map;
  }
  const rows = await supaDayState.getDayStatesForDateRange(date, date);
  return new Map(rows.map((r) => [r.activityId, { closed: r.closed, closedAt: r.closedAt, closedBy: r.closedBy }]));
}

/** closedByName is what demo mode stores (it has no real user ids);
 * closedByUserId is what Supabase mode stores (a real profiles.id FK). */
export async function closeDay(activityId: string, date: Date, closedByUserId: string, closedByName: string): Promise<void> {
  if (!isSupabaseConfigured) {
    if (getDemoActivityDayState(activityId).closed) throw new Error("Cette séance est déjà clôturée.");
    closeDemoActivityDay(activityId, closedByName);
    return;
  }
  const realClosedBy = await resolveRealUserId(closedByUserId);
  return supaDayState.closeDay(activityId, date, realClosedBy);
}

// ---------------------------------------------------------------------------
// Notifications — same demo/Supabase split as everything else here. The demo
// store is in-process memory (an EventEmitter + array on globalThis), which
// only ever worked because local dev runs a single long-lived process; it
// cannot be the source of truth for anything meant to survive a restart or
// run correctly across Vercel's independent serverless instances. Supabase
// mode is the one production actually depends on.
// ---------------------------------------------------------------------------

export interface NotificationRecord {
  id: string;
  activityId: string;
  message: string;
  createdAt: Date;
  createdBy: string;
  read: boolean;
  readAt: Date | null;
}

export async function getNotificationsForActivityData(activityId: string): Promise<NotificationRecord[]> {
  if (!isSupabaseConfigured) return demoNotifications.getNotificationsForActivity(activityId);
  return supaNotifications.getNotificationsForActivity(activityId);
}

export async function getUnreadCountForActivityData(activityId: string): Promise<number> {
  if (!isSupabaseConfigured) return demoNotifications.getUnreadCountForActivity(activityId);
  return supaNotifications.getUnreadCountForActivity(activityId);
}

export async function getAllNotificationsData(): Promise<NotificationRecord[]> {
  if (!isSupabaseConfigured) return demoNotifications.getAllNotifications();
  return supaNotifications.getAllNotifications();
}

/** createdByName is what demo mode stores (it has no real user ids);
 * createdByUserId is what Supabase mode stores (a real profiles.id FK). */
export async function addNotificationRecord(
  activityId: string,
  message: string,
  createdByUserId: string,
  createdByName: string,
): Promise<NotificationRecord> {
  if (!isSupabaseConfigured) return demoNotifications.addNotification(activityId, message, createdByName);
  const realCreatedBy = await resolveRealUserId(createdByUserId);
  return supaNotifications.addNotification(activityId, message, realCreatedBy);
}

export async function markActivityNotificationsReadData(activityId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    demoNotifications.markActivityNotificationsRead(activityId);
    return;
  }
  return supaNotifications.markActivityNotificationsRead(activityId);
}

// ---------------------------------------------------------------------------
// Monitor account administration (activate/deactivate) — Supabase-only.
// Demo mode has no real accounts to deactivate, so it reports everyone
// active and refuses the toggle with a clear error rather than pretending.
// ---------------------------------------------------------------------------

export interface MonitorAdminRecord {
  id: string;
  name: string;
  email: string | null;
  role: "ADMIN" | "MONITOR";
  activityId: string | null;
  activityName: string | null;
  active: boolean;
}

export const getMonitorsForAdminList = cache(async (): Promise<MonitorAdminRecord[]> => {
  if (!isSupabaseConfigured) {
    return MONITORS.map((m) => ({ id: m.id, name: m.name, email: null, role: "MONITOR" as const, activityId: null, activityName: null, active: true }));
  }
  return supaMonitors.getMonitorsForAdmin();
});

export async function setMonitorActiveRecord(monitorId: string, active: boolean, actingAdminId: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new PresenceCommandError("La désactivation d'un moniteur nécessite Supabase.");
  }
  const realActingAdminId = await resolveRealUserId(actingAdminId);
  if (!realActingAdminId) {
    throw new PresenceCommandError("Impossible de déterminer l'administrateur à l'origine de cette action.");
  }
  return supaMonitors.setMonitorActive(monitorId, active, realActingAdminId);
}

export async function isMonitorEmailTaken(email: string): Promise<boolean> {
  if (!isSupabaseConfigured) return false;
  return supaMonitors.isEmailAlreadyUsed(email);
}

export async function createAccountRecord(
  email: string,
  password: string,
  fullName: string,
  role: "ADMIN" | "MONITOR",
  activityId: string | null,
): Promise<string> {
  if (!isSupabaseConfigured) {
    throw new PresenceCommandError("La création d'un compte nécessite Supabase.");
  }
  return supaMonitors.createAccountWithPassword(email, password, fullName, role, activityId);
}

export async function updateMonitorNameRecord(monitorId: string, fullName: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new PresenceCommandError("La modification d'un moniteur nécessite Supabase.");
  }
  return supaMonitors.updateMonitorName(monitorId, fullName);
}

export async function updateAccountPasswordRecord(userId: string, newPassword: string): Promise<void> {
  if (!isSupabaseConfigured) {
    throw new PresenceCommandError("La modification du mot de passe nécessite Supabase.");
  }
  return supaMonitors.updateAccountPassword(userId, newPassword);
}

// ---------------------------------------------------------------------------
// Weekly roster — "who is actually attending which activity this week",
// distinct from the permanent children directory. Demo mode has no concept
// of a week (its in-memory store has only ever modeled "today"), so it
// always returns an empty roster — the query layer's own legacy fallback
// ("no roster row exists for this week -> use every active child assigned to
// the activity") already gives demo mode exactly its current, correct
// behavior with zero special-casing here.
// ---------------------------------------------------------------------------

export { weekBounds } from "@/server/supabase/weekly-roster-repo";
export type { RosterEntry } from "@/server/supabase/weekly-roster-repo";

export const getRosterForWeek = cache(async (weekStart: string): Promise<supaRoster.RosterEntry[]> => {
  if (!isSupabaseConfigured) return [];
  return supaRoster.getRosterForWeek(weekStart);
});

export async function addToRosterRecord(childId: string, activityId: string, weekStart: string, weekEnd: string, createdBy: string | null): Promise<void> {
  if (!isSupabaseConfigured) throw new PresenceCommandError("La gestion du roster nécessite Supabase.");
  const realCreatedBy = createdBy ? await resolveRealUserId(createdBy) : null;
  return supaRoster.addToRoster(childId, activityId, weekStart, weekEnd, realCreatedBy);
}

export async function removeFromRosterRecord(childId: string, weekStart: string): Promise<void> {
  if (!isSupabaseConfigured) throw new PresenceCommandError("La gestion du roster nécessite Supabase.");
  return supaRoster.removeFromRoster(childId, weekStart);
}

export async function resetRosterForActivityWeekRecord(activityId: string, weekStart: string): Promise<number> {
  if (!isSupabaseConfigured) throw new PresenceCommandError("La gestion du roster nécessite Supabase.");
  return supaRoster.resetRosterForActivityWeek(activityId, weekStart);
}

export async function duplicateRosterWeekRecord(fromWeekStart: string, toWeekStart: string, toWeekEnd: string, createdBy: string | null): Promise<number> {
  if (!isSupabaseConfigured) throw new PresenceCommandError("La gestion du roster nécessite Supabase.");
  const realCreatedBy = createdBy ? await resolveRealUserId(createdBy) : null;
  return supaRoster.duplicateRosterWeek(fromWeekStart, toWeekStart, toWeekEnd, realCreatedBy);
}

export async function bulkAddToRosterRecord(
  entries: Array<{ childId: string; activityId: string }>,
  weekStart: string,
  weekEnd: string,
  createdBy: string | null,
): Promise<void> {
  if (!isSupabaseConfigured) throw new PresenceCommandError("La gestion du roster nécessite Supabase.");
  const realCreatedBy = createdBy ? await resolveRealUserId(createdBy) : null;
  return supaRoster.bulkAddToRoster(entries, weekStart, weekEnd, realCreatedBy);
}
