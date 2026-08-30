import {
  getActivitiesList,
  getAllNotificationsData,
  getAttendanceMap,
  getChildById,
  getChildrenList,
  getDayState,
  getDayStatesForDate,
  getMonitorsForAdminList,
  getMonitorsList,
  getNotificationsForActivityData,
  getUnreadCountForActivityData,
  type MonitorAdminRecord,
  type NotificationRecord,
} from "@/server/data-source";
import { daycareReason, eveningStatus, type DaycareReason } from "@/features/presence/domain/daycare";
import { morningStatus, type PresenceRecord } from "@/features/presence/domain/types";
import type { EveningStatus, MorningStatus } from "@/features/presence/domain/types";

function emptyRecord(childId: string, activityId: string): PresenceRecord {
  return { childId, activityId, arrived: false, arrivedAt: null, left: false, leftAt: null, daycareManual: false };
}

/**
 * The monitor's name is a label, not something a whole page should die over.
 * If the lookup fails (a bad query, a transient Supabase error), every
 * caller of this function falls back to "Moniteur" instead of taking the
 * entire page down with it.
 */
async function monitorName(monitorId: string): Promise<string> {
  try {
    const monitors = await getMonitorsList();
    return monitors.find((m) => m.id === monitorId)?.name ?? "Moniteur";
  } catch (error) {
    console.error("monitorName lookup failed, falling back to a generic label:", error);
    return "Moniteur";
  }
}

function sortByName<T extends { firstName: string; lastName: string }>(children: T[]): T[] {
  return [...children].sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));
}

export interface ActivityOverview {
  id: string;
  name: string;
  monitorName: string;
  total: number;
  arrivedCount: number;
  absentCount: number;
  notMarkedCount: number;
  closed: boolean;
}

export async function listActivitiesOverview(now = new Date()): Promise<ActivityOverview[]> {
  const [activities, allChildren, records] = await Promise.all([getActivitiesList(), getChildrenList(), getAttendanceMap(now)]);

  return Promise.all(
    activities.map(async (activity) => {
      const children = allChildren.filter((c) => c.activityId === activity.id && c.active);
      const statuses = children.map((c) => morningStatus(records.get(c.id)));
      const dayState = await getDayState(activity.id, now);
      return {
        id: activity.id,
        name: activity.name,
        monitorName: await monitorName(activity.monitorId ?? ""),
        total: children.length,
        arrivedCount: statuses.filter((s) => s === "ARRIVED").length,
        absentCount: statuses.filter((s) => s === "ABSENT").length,
        notMarkedCount: statuses.filter((s) => s === "NOT_MARKED").length,
        closed: dayState.closed,
      };
    }),
  );
}

export interface ChildMorningRow {
  childId: string;
  firstName: string;
  lastName: string;
  status: MorningStatus;
}

export interface ChildEveningRow {
  childId: string;
  firstName: string;
  lastName: string;
  status: EveningStatus;
}

export interface EveningCounters {
  presentTotal: number;
  leftCount: number;
  stillPresentCount: number;
}

export interface ChildGarderieRow {
  childId: string;
  firstName: string;
  lastName: string;
  reason: DaycareReason;
}

/**
 * NOT_STARTED: nobody has been marked yet. IN_PROGRESS: some children
 * marked, some not, session still open. CLOSED: the monitor closed the day
 * (closeActivityDay finalizes every remaining NOT_MARKED child to ABSENT at
 * that point, so "closed" and "everyone marked" always agree afterward).
 */
export type SessionState = "NOT_STARTED" | "IN_PROGRESS" | "CLOSED";

export interface ActivityDetail {
  id: string;
  name: string;
  monitorName: string;
  closed: boolean;
  closedAt: Date | null;
  sessionState: SessionState;
  morningCounters: { total: number; arrivedCount: number; absentCount: number; notMarkedCount: number };
  eveningCounters: EveningCounters;
  garderieCount: number;
  morningList: ChildMorningRow[];
  eveningList: ChildEveningRow[];
  /**
   * Every child currently in daycare for this activity, PLANNED (daycareAuto)
   * or AFTER_SESSION alike. Deliberately separate from eveningList, which
   * excludes daycareAuto children on purpose (they never appear in this
   * activity's own departure workflow) — a view that needs the full daycare
   * picture (like history) must not reuse eveningList for that.
   */
  garderieList: ChildGarderieRow[];
}

/**
 * `now` doubles as both "which date's attendance to load" and "current time
 * for the daycare-cutoff comparison". That's only ambiguous for a past date
 * that was never closed (a monitor who forgot) — everywhere else, a closed
 * day already short-circuits the cutoff check, so passing the real current
 * time alongside a past date's stored rows is safe.
 */
export async function getActivityDetail(activityId: string, now = new Date()): Promise<ActivityDetail | null> {
  const activities = await getActivitiesList();
  const activity = activities.find((a) => a.id === activityId);
  if (!activity) return null;

  const dayState = await getDayState(activityId, now);
  const [records, allChildren] = await Promise.all([getAttendanceMap(now, activityId), getChildrenList()]);
  const children = sortByName(allChildren.filter((c) => c.activityId === activityId && c.active));

  const morningList: ChildMorningRow[] = children.map((child) => {
    return { childId: child.id, firstName: child.firstName, lastName: child.lastName, status: morningStatus(records.get(child.id)) };
  });

  // Children registered for automatic daycare skip this activity's own
  // departure list entirely: nobody picks them up here, they go to Garderie.
  const eveningChildren = children.filter((c) => !c.daycareAuto && records.get(c.id)?.arrived);
  const eveningList: ChildEveningRow[] = eveningChildren.map((child) => {
    const record = records.get(child.id) ?? emptyRecord(child.id, activityId);
    return { childId: child.id, firstName: child.firstName, lastName: child.lastName, status: eveningStatus(record, dayState.closed, now) };
  });

  const arrivedCount = morningList.filter((c) => c.status === "ARRIVED").length;
  const absentCount = morningList.filter((c) => c.status === "ABSENT").length;
  const notMarkedCount = morningList.filter((c) => c.status === "NOT_MARKED").length;

  const sessionState: SessionState = dayState.closed
    ? "CLOSED"
    : notMarkedCount === morningList.length
      ? "NOT_STARTED"
      : "IN_PROGRESS";

  const garderieList: ChildGarderieRow[] = children.flatMap((child) => {
    const record = records.get(child.id) ?? emptyRecord(child.id, activityId);
    const reason = daycareReason(record, child.daycareAuto, dayState.closed, now);
    return reason ? [{ childId: child.id, firstName: child.firstName, lastName: child.lastName, reason }] : [];
  });

  return {
    id: activity.id,
    name: activity.name,
    monitorName: await monitorName(activity.monitorId ?? ""),
    closed: dayState.closed,
    closedAt: dayState.closedAt,
    sessionState,
    morningCounters: { total: morningList.length, arrivedCount, absentCount, notMarkedCount },
    eveningCounters: {
      presentTotal: eveningList.length,
      leftCount: eveningList.filter((c) => c.status === "LEFT").length,
      stillPresentCount: eveningList.filter((c) => c.status !== "LEFT").length,
    },
    garderieCount: garderieList.length,
    morningList,
    eveningList,
    garderieList,
  };
}

export async function getActivityIdForMonitor(monitorId: string): Promise<string | null> {
  const activities = await getActivitiesList();
  return activities.find((a) => a.monitorId === monitorId)?.id ?? null;
}

export interface AssignmentRow {
  activityId: string;
  activityName: string;
  monitorId: string;
}

export async function listAssignments(): Promise<AssignmentRow[]> {
  const activities = await getActivitiesList();
  return activities.map((activity) => ({
    activityId: activity.id,
    activityName: activity.name,
    monitorId: activity.monitorId ?? "",
  }));
}

export async function listMonitorsForAdmin(): Promise<MonitorAdminRecord[]> {
  return getMonitorsForAdminList();
}

export interface DaycareRow {
  childId: string;
  firstName: string;
  lastName: string;
  activityId: string;
  activityName: string;
  reason: DaycareReason;
  arrivedAt: Date | null;
}

/**
 * For an admin, Garderie is global — children converge here from every
 * activity. A monitor passing their own activityId only ever sees their own
 * activity's children here, same as every other monitor-facing screen —
 * without this filter a monitor would see every other activity's daycare
 * children too, which is exactly the cross-activity leak the rest of the
 * app is careful to avoid.
 */
export async function getDaycareList(now = new Date(), activityId?: string): Promise<DaycareRow[]> {
  const [records, allChildren, activities, dayStates] = await Promise.all([
    getAttendanceMap(now, activityId),
    getChildrenList(),
    getActivitiesList(),
    getDayStatesForDate(now),
  ]);
  const rows: DaycareRow[] = [];

  for (const child of allChildren) {
    if (!child.active) continue;
    if (activityId && child.activityId !== activityId) continue;
    const record = records.get(child.id);
    if (!record) continue;
    const activity = activities.find((a) => a.id === child.activityId);
    if (!activity) continue;

    const closed = dayStates.get(child.activityId)?.closed ?? false;
    const reason = daycareReason(record, child.daycareAuto, closed, now);
    if (reason) {
      rows.push({
        childId: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        activityId: activity.id,
        activityName: activity.name,
        reason,
        arrivedAt: record.arrivedAt,
      });
    }
  }

  return sortByName(rows);
}

export interface ChildPickerRow {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  activityName: string;
}

/**
 * Backs the Garderie "+ Ajouter un enfant" search: an admin can pick from
 * every active child, a monitor only from their own activity's — same scope
 * getDaycareList itself already enforces, so the picker never even shows a
 * child the add action would go on to reject server-side anyway.
 */
export async function listChildrenForDaycarePicker(activityId?: string): Promise<ChildPickerRow[]> {
  const [allChildren, activities] = await Promise.all([getChildrenList(), getActivitiesList()]);
  const activityById = new Map(activities.map((a) => [a.id, a.name]));
  return sortByName(
    allChildren
      .filter((c) => c.active && (!activityId || c.activityId === activityId))
      .map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        activityId: c.activityId,
        activityName: activityById.get(c.activityId) ?? "Activité",
      })),
  );
}

export async function getNotificationsForMonitor(activityId: string): Promise<NotificationRecord[]> {
  return getNotificationsForActivityData(activityId);
}

export async function getUnreadNotificationCount(activityId: string): Promise<number> {
  return getUnreadCountForActivityData(activityId);
}

export interface NotificationRow extends NotificationRecord {
  activityName: string;
}

export async function getAllNotificationsForAdmin(): Promise<NotificationRow[]> {
  const [activities, notifications] = await Promise.all([getActivitiesList(), getAllNotificationsData()]);
  return notifications.map((n) => ({
    ...n,
    activityName: activities.find((a) => a.id === n.activityId)?.name ?? "Activité",
  }));
}

export interface ChildAdminRow {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  activityName: string;
  daycareAuto: boolean;
  active: boolean;
  notes: string;
  isDemo: boolean;
  createdAt: Date;
}

export async function listChildrenForAdmin(): Promise<ChildAdminRow[]> {
  const [allChildren, activities] = await Promise.all([getChildrenList(), getActivitiesList()]);
  return sortByName(allChildren).map((child) => ({
    ...child,
    activityName: activities.find((a) => a.id === child.activityId)?.name ?? "Activité",
  }));
}

export async function getChildForAdmin(childId: string): Promise<ChildAdminRow | null> {
  const [child, activities] = await Promise.all([getChildById(childId), getActivitiesList()]);
  if (!child) return null;
  return { ...child, activityName: activities.find((a) => a.id === child.activityId)?.name ?? "Activité" };
}
