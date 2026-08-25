import { getActivityDayState } from "@/server/demo/activity-day-store";
import { getAllNotifications, getNotificationsForActivity, getUnreadCountForActivity, type Notification } from "@/server/demo/notifications-store";
import { getPresenceRecords } from "@/server/demo/store";
import { getActivitiesList, getChildById, getChildrenList, getMonitorsList } from "@/server/data-source";
import { daycareReason, eveningStatus, type DaycareReason } from "@/features/presence/domain/daycare";
import { morningStatus } from "@/features/presence/domain/types";
import type { EveningStatus, MorningStatus } from "@/features/presence/domain/types";

async function monitorName(monitorId: string): Promise<string> {
  const monitors = await getMonitorsList();
  return monitors.find((m) => m.id === monitorId)?.name ?? "Moniteur";
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

export async function listActivitiesOverview(): Promise<ActivityOverview[]> {
  const [activities, allChildren, records] = await Promise.all([getActivitiesList(), getChildrenList(), getPresenceRecords()]);

  return Promise.all(
    activities.map(async (activity) => {
      const children = allChildren.filter((c) => c.activityId === activity.id && c.active);
      const arrivedCount = children.filter((c) => records.get(c.id)?.arrived).length;
      return {
        id: activity.id,
        name: activity.name,
        monitorName: await monitorName(activity.monitorId ?? ""),
        total: children.length,
        arrivedCount,
        absentCount: children.length - arrivedCount,
        closed: getActivityDayState(activity.id).closed,
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

export async function getActivityDetail(activityId: string, now = new Date()): Promise<ActivityDetail | null> {
  const activities = await getActivitiesList();
  const activity = activities.find((a) => a.id === activityId);
  if (!activity) return null;

  const dayState = getActivityDayState(activityId);
  const [records, allChildren] = await Promise.all([getPresenceRecords(), getChildrenList()]);
  const children = sortByName(allChildren.filter((c) => c.activityId === activityId && c.active));

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
    monitorName: await monitorName(activity.monitorId ?? ""),
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

export interface DaycareRow {
  childId: string;
  firstName: string;
  lastName: string;
  activityId: string;
  activityName: string;
  reason: DaycareReason;
}

/** The Garderie list is global, not per-activity: children converge here from every activity. */
export async function getDaycareList(now = new Date()): Promise<DaycareRow[]> {
  const [records, allChildren, activities] = await Promise.all([getPresenceRecords(), getChildrenList(), getActivitiesList()]);
  const rows: DaycareRow[] = [];

  for (const child of allChildren) {
    if (!child.active) continue;
    const record = records.get(child.id);
    if (!record) continue;
    const activity = activities.find((a) => a.id === child.activityId);
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

export async function getDashboardSummary(now = new Date()): Promise<DashboardSummary> {
  const [activities, records, allChildren, daycare] = await Promise.all([
    listActivitiesOverview(),
    getPresenceRecords(),
    getChildrenList(),
    getDaycareList(now),
  ]);
  const children = allChildren.filter((c) => c.active);

  return {
    childrenToday: children.length,
    presentCount: children.filter((c) => records.get(c.id)?.arrived && !records.get(c.id)?.left).length,
    absentCount: children.filter((c) => !records.get(c.id)?.arrived).length,
    daycareCount: daycare.length,
    activities,
  };
}

export function getNotificationsForMonitor(activityId: string): Notification[] {
  return getNotificationsForActivity(activityId);
}

export function getUnreadNotificationCount(activityId: string): number {
  return getUnreadCountForActivity(activityId);
}

export interface NotificationRow extends Notification {
  activityName: string;
}

export async function getAllNotificationsForAdmin(): Promise<NotificationRow[]> {
  const activities = await getActivitiesList();
  return getAllNotifications().map((n) => ({
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
