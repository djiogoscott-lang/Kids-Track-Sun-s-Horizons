import { ACTIVITIES, MONITORS } from "@/server/demo/data";
import { getActivityDayState } from "@/server/demo/activity-day-store";
import { getChild, getChildren } from "@/server/demo/children-store";
import { getAllNotifications, getNotificationsForActivity, type Notification } from "@/server/demo/notifications-store";
import { getActivityAssignments, getPresenceRecords } from "@/server/demo/store";
import { daycareReason, eveningStatus, type DaycareReason } from "@/features/presence/domain/daycare";
import { morningStatus } from "@/features/presence/domain/types";
import type { EveningStatus, MorningStatus } from "@/features/presence/domain/types";

function monitorName(monitorId: string): string {
  return MONITORS.find((m) => m.id === monitorId)?.name ?? "Moniteur";
}

function currentMonitorId(activityId: string): string | undefined {
  return getActivityAssignments().get(activityId);
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
  closed: boolean;
}

export function listActivitiesOverview(): ActivityOverview[] {
  const records = getPresenceRecords();

  return ACTIVITIES.map((activity) => {
    const children = getChildren().filter((c) => c.activityId === activity.id && c.active);
    const arrivedCount = children.filter((c) => records.get(c.id)?.arrived).length;
    return {
      id: activity.id,
      name: activity.name,
      monitorName: monitorName(currentMonitorId(activity.id) ?? ""),
      total: children.length,
      arrivedCount,
      absentCount: children.length - arrivedCount,
      closed: getActivityDayState(activity.id).closed,
    };
  });
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

export interface ActivityDetail {
  id: string;
  name: string;
  monitorName: string;
  closed: boolean;
  closedAt: Date | null;
  morningCounters: { total: number; arrivedCount: number; absentCount: number };
  eveningCounters: EveningCounters;
  morningList: ChildMorningRow[];
  eveningList: ChildEveningRow[];
}

export function getActivityDetail(activityId: string, now = new Date()): ActivityDetail | null {
  const activity = ACTIVITIES.find((a) => a.id === activityId);
  if (!activity) return null;

  const dayState = getActivityDayState(activityId);
  const records = getPresenceRecords();
  const children = sortByName(getChildren().filter((c) => c.activityId === activityId && c.active));

  const morningList: ChildMorningRow[] = children.map((child) => {
    const record = records.get(child.id)!;
    return { childId: child.id, firstName: child.firstName, lastName: child.lastName, status: morningStatus(record) };
  });

  // Children registered for automatic daycare skip this activity's own
  // departure list entirely: nobody picks them up here, they go to Garderie.
  const eveningChildren = children.filter((c) => !c.daycareAuto && records.get(c.id)?.arrived);
  const eveningList: ChildEveningRow[] = eveningChildren.map((child) => {
    const record = records.get(child.id)!;
    return { childId: child.id, firstName: child.firstName, lastName: child.lastName, status: eveningStatus(record, dayState.closed, now) };
  });

  const arrivedCount = morningList.filter((c) => c.status === "ARRIVED").length;

  return {
    id: activity.id,
    name: activity.name,
    monitorName: monitorName(currentMonitorId(activity.id) ?? ""),
    closed: dayState.closed,
    closedAt: dayState.closedAt,
    morningCounters: { total: morningList.length, arrivedCount, absentCount: morningList.length - arrivedCount },
    eveningCounters: {
      presentTotal: eveningList.length,
      leftCount: eveningList.filter((c) => c.status === "LEFT").length,
      stillPresentCount: eveningList.filter((c) => c.status !== "LEFT").length,
    },
    morningList,
    eveningList,
  };
}

export function getActivityIdForMonitor(monitorId: string): string | null {
  const assignments = getActivityAssignments();
  for (const [activityId, assignedMonitorId] of assignments) {
    if (assignedMonitorId === monitorId) return activityId;
  }
  return null;
}

export interface AssignmentRow {
  activityId: string;
  activityName: string;
  monitorId: string;
}

export function listAssignments(): AssignmentRow[] {
  return ACTIVITIES.map((activity) => ({
    activityId: activity.id,
    activityName: activity.name,
    monitorId: currentMonitorId(activity.id) ?? "",
  }));
}

export interface DaycareRow {
  childId: string;
  firstName: string;
  lastName: string;
  activityId: string;
  activityName: string;
  reason: DaycareReason;
}

/** The Garderie list is global, not per-activity: children converge here from every activity. */
export function getDaycareList(now = new Date()): DaycareRow[] {
  const records = getPresenceRecords();
  const rows: DaycareRow[] = [];

  for (const child of getChildren()) {
    if (!child.active) continue;
    const record = records.get(child.id);
    if (!record) continue;
    const activity = ACTIVITIES.find((a) => a.id === child.activityId);
    if (!activity) continue;

    const reason = daycareReason(record, child.daycareAuto, getActivityDayState(child.activityId).closed, now);
    if (reason) {
      rows.push({
        childId: child.id,
        firstName: child.firstName,
        lastName: child.lastName,
        activityId: activity.id,
        activityName: activity.name,
        reason,
      });
    }
  }

  return sortByName(rows);
}

export interface DashboardSummary {
  childrenToday: number;
  presentCount: number;
  absentCount: number;
  daycareCount: number;
  activities: ActivityOverview[];
}

export function getDashboardSummary(now = new Date()): DashboardSummary {
  const activities = listActivitiesOverview();
  const records = getPresenceRecords();
  const children = getChildren().filter((c) => c.active);

  return {
    childrenToday: children.length,
    presentCount: children.filter((c) => records.get(c.id)?.arrived && !records.get(c.id)?.left).length,
    absentCount: children.filter((c) => !records.get(c.id)?.arrived).length,
    daycareCount: getDaycareList(now).length,
    activities,
  };
}

export function getNotificationsForMonitor(activityId: string): Notification[] {
  return getNotificationsForActivity(activityId);
}

export interface NotificationRow extends Notification {
  activityName: string;
}

export function getAllNotificationsForAdmin(): NotificationRow[] {
  return getAllNotifications().map((n) => ({
    ...n,
    activityName: ACTIVITIES.find((a) => a.id === n.activityId)?.name ?? "Activité",
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
}

export function listChildrenForAdmin(): ChildAdminRow[] {
  return sortByName(getChildren()).map((child) => ({
    ...child,
    activityName: ACTIVITIES.find((a) => a.id === child.activityId)?.name ?? "Activité",
  }));
}

export function getChildForAdmin(childId: string): ChildAdminRow | null {
  const child = getChild(childId);
  if (!child) return null;
  return { ...child, activityName: ACTIVITIES.find((a) => a.id === child.activityId)?.name ?? "Activité" };
}
