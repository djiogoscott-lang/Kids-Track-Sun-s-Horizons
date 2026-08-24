import { ACTIVITIES, CHILDREN, MONITORS } from "@/server/demo/data";
import { getActivityAssignments, getPresenceRecords } from "@/server/demo/store";
import { eveningStatus } from "@/features/presence/domain/daycare";
import { morningStatus } from "@/features/presence/domain/types";
import type { EveningStatus, MorningStatus } from "@/features/presence/domain/types";

function monitorName(monitorId: string): string {
  return MONITORS.find((m) => m.id === monitorId)?.name ?? "Moniteur";
}

function currentMonitorId(activityId: string): string | undefined {
  return getActivityAssignments().get(activityId);
}

export interface ActivityOverview {
  id: string;
  name: string;
  monitorName: string;
  total: number;
  arrivedCount: number;
  absentCount: number;
}

export function listActivitiesOverview(): ActivityOverview[] {
  const records = getPresenceRecords();

  return ACTIVITIES.map((activity) => {
    const children = CHILDREN.filter((c) => c.activityId === activity.id);
    const arrivedCount = children.filter((c) => records.get(c.id)?.arrived).length;
    return {
      id: activity.id,
      name: activity.name,
      monitorName: monitorName(currentMonitorId(activity.id) ?? activity.monitorId),
      total: children.length,
      arrivedCount,
      absentCount: children.length - arrivedCount,
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

export interface ActivityDetail {
  id: string;
  name: string;
  monitorName: string;
  morningList: ChildMorningRow[];
  eveningList: ChildEveningRow[];
}

export function getActivityDetail(activityId: string, now = new Date()): ActivityDetail | null {
  const activity = ACTIVITIES.find((a) => a.id === activityId);
  if (!activity) return null;

  const records = getPresenceRecords();
  const children = CHILDREN.filter((c) => c.activityId === activityId).sort((a, b) =>
    `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`),
  );

  const morningList: ChildMorningRow[] = children.map((child) => {
    const record = records.get(child.id)!;
    return { childId: child.id, firstName: child.firstName, lastName: child.lastName, status: morningStatus(record) };
  });

  const eveningList: ChildEveningRow[] = children
    .filter((child) => records.get(child.id)?.arrived)
    .map((child) => {
      const record = records.get(child.id)!;
      return { childId: child.id, firstName: child.firstName, lastName: child.lastName, status: eveningStatus(record, now) };
    });

  return {
    id: activity.id,
    name: activity.name,
    monitorName: monitorName(currentMonitorId(activity.id) ?? activity.monitorId),
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
    monitorId: currentMonitorId(activity.id) ?? activity.monitorId,
  }));
}
