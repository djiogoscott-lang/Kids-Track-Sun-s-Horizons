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
}

export async function getActivitiesList(): Promise<ActivityRecord[]> {
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
}

export async function getMonitorsList(): Promise<MonitorRecord[]> {
  if (isSupabaseAuthEnabled) return supaActivities.getMonitors();
  return MONITORS.map((m) => ({ id: m.id, name: m.name }));
}

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

export async function getChildrenList(): Promise<ChildRecord[]> {
  if (isSupabaseConfigured) return supaChildren.getChildren();
  return demoChildren.getChildren();
}

export async function getChildById(childId: string): Promise<ChildRecord | undefined> {
  if (isSupabaseConfigured) return supaChildren.getChild(childId);
  return demoChildren.getChild(childId);
}

export interface NewChildRecordInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
}

export async function createChildRecord(input: NewChildRecordInput): Promise<ChildRecord> {
  if (isSupabaseConfigured) return supaChildren.createChild(input);
  return demoChildren.createChild(input);
}

export type ChildRecordUpdate = Partial<Pick<ChildRecord, "firstName" | "lastName" | "activityId" | "daycareAuto" | "notes" | "active">>;

export async function updateChildRecord(childId: string, update: ChildRecordUpdate): Promise<ChildRecord | null> {
  if (isSupabaseConfigured) return supaChildren.updateChild(childId, update);
  return demoChildren.updateChild(childId, update);
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
    const existing = records.get(childId) ?? { childId, activityId, arrived: false, arrivedAt: null, left: false, leftAt: null };
    records.set(childId, {
      ...existing,
      activityId,
      arrived: patch.arrived ?? existing.arrived,
      arrivedAt: patch.arrivedAt !== undefined ? patch.arrivedAt : existing.arrivedAt,
      left: patch.departed ?? existing.left,
      leftAt: patch.departedAt !== undefined ? patch.departedAt : existing.leftAt,
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
