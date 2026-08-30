import {
  getActivitiesList,
  getAttendanceForChild,
  getAttendanceForDateRange,
  getChildrenList,
  getDayStatesForDateRange,
} from "@/server/data-source";
import { getActivityDetail, type ActivityDetail, type SessionState } from "./queries";
import { daycareReason, eveningStatus } from "@/features/presence/domain/daycare";
import { morningStatus, type PresenceRecord } from "@/features/presence/domain/types";

/**
 * Everything here reads through the same getActivityDetail()/domain
 * functions the live "today" screens use — history is not a second,
 * parallel interpretation of the data, it's the same interpretation
 * applied to a date that happens to be in the past.
 */

export interface DaySummaryRow {
  activityId: string;
  activityName: string;
  monitorName: string;
  total: number;
  arrivedCount: number;
  absentCount: number;
  notMarkedCount: number;
  leftCount: number;
  garderieCount: number;
  closed: boolean;
  closedAt: Date | null;
  sessionState: SessionState;
}

export async function getDaySummary(date: Date): Promise<DaySummaryRow[]> {
  const activities = await getActivitiesList();
  const details = await Promise.all(activities.map((a) => getActivityDetail(a.id, date)));
  return activities.map((a, i) => {
    const d: ActivityDetail | null = details[i];
    return {
      activityId: a.id,
      activityName: a.name,
      monitorName: d?.monitorName ?? "Moniteur",
      total: d?.morningCounters.total ?? 0,
      arrivedCount: d?.morningCounters.arrivedCount ?? 0,
      absentCount: d?.morningCounters.absentCount ?? 0,
      notMarkedCount: d?.morningCounters.notMarkedCount ?? 0,
      leftCount: d?.eveningCounters.leftCount ?? 0,
      garderieCount: d?.garderieCount ?? 0,
      closed: d?.closed ?? false,
      closedAt: d?.closedAt ?? null,
      sessionState: d?.sessionState ?? "NOT_STARTED",
    };
  });
}

export interface WeekDaySummary {
  date: string;
  /** false when nobody has taken attendance yet for this date (future date,
   * or a past date the app was never opened for) — never fabricate absents
   * from a roster count in that case. */
  hasSession: boolean;
  arrivedCount: number;
  absentCount: number;
  notMarkedCount: number;
  leftCount: number;
  garderieCount: number;
}

/** Monday-to-Friday, 5 days starting from startDate. */
export async function getWeekSummary(startDate: Date, activityId?: string): Promise<WeekDaySummary[]> {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 4);

  const [rows, dayStateRows, allChildren] = await Promise.all([
    getAttendanceForDateRange(startDate, endDate, activityId),
    getDayStatesForDateRange(startDate, endDate, activityId),
    getChildrenList(),
  ]);

  const childById = new Map(allChildren.map((c) => [c.id, c]));
  const closedByKey = new Map(dayStateRows.map((d) => [`${d.activityId}_${d.date}`, d.closed]));
  const totalRoster = allChildren.filter((c) => c.active && (!activityId || c.activityId === activityId)).length;

  const byDate = new Map<string, { date: string; arrivedCount: number; absentCount: number; leftCount: number; garderieCount: number }>();
  for (let i = 0; i < 5; i++) {
    const d = new Date(startDate);
    d.setDate(d.getDate() + i);
    const key = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(d);
    byDate.set(key, { date: key, arrivedCount: 0, absentCount: 0, leftCount: 0, garderieCount: 0 });
  }

  for (const row of rows) {
    const bucket = byDate.get(row.date);
    if (!bucket) continue;
    const child = childById.get(row.childId);
    if (!child) continue;

    // A row only exists once attendance has actually been recorded for that
    // child/date — arrived=false here means an explicit "Absent" mark, never
    // a child nobody has touched yet (those never get a row at all).
    if (row.arrived) bucket.arrivedCount += 1;
    else bucket.absentCount += 1;
    if (row.left) bucket.leftCount += 1;

    const closed = closedByKey.get(`${row.activityId}_${row.date}`) ?? false;
    const record: PresenceRecord = { childId: row.childId, activityId: row.activityId, arrived: row.arrived, arrivedAt: row.arrivedAt, left: row.left, leftAt: row.leftAt, daycareManual: row.daycareManual };
    if (daycareReason(record, child.daycareAuto, closed, new Date(`${row.date}T23:59:59`))) {
      bucket.garderieCount += 1;
    }
  }

  return [...byDate.values()]
    .map((bucket) => ({
      ...bucket,
      notMarkedCount: Math.max(0, totalRoster - bucket.arrivedCount - bucket.absentCount),
      hasSession: bucket.arrivedCount + bucket.absentCount > 0,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export interface ChildHistoryRow {
  date: string;
  activityId: string;
  activityName: string;
  status: "ABSENT" | "LEFT" | "STILL_PRESENT" | "DAYCARE";
  arrivedAt: Date | null;
  departedAt: Date | null;
}

export async function getChildHistory(childId: string, limit = 60): Promise<ChildHistoryRow[]> {
  const rows = await getAttendanceForChild(childId, limit);
  if (rows.length === 0) return [];

  const activities = await getActivitiesList();
  const activityById = new Map(activities.map((a) => [a.id, a.name]));

  const activityIds = [...new Set(rows.map((r) => r.activityId))];
  const dates = rows.map((r) => r.date).sort();
  const start = new Date(`${dates[0]}T00:00:00`);
  const end = new Date(`${dates[dates.length - 1]}T00:00:00`);
  const dayStateRows = (
    await Promise.all(activityIds.map((id) => getDayStatesForDateRange(start, end, id)))
  ).flat();
  const closedByKey = new Map(dayStateRows.map((d) => [`${d.activityId}_${d.date}`, d.closed]));

  return rows.map((row) => {
    const record: PresenceRecord = { childId: row.childId, activityId: row.activityId, arrived: row.arrived, arrivedAt: row.arrivedAt, left: row.left, leftAt: row.leftAt, daycareManual: row.daycareManual };
    const closed = closedByKey.get(`${row.activityId}_${row.date}`) ?? false;
    const morning = morningStatus(record);
    const status = morning === "ABSENT" ? "ABSENT" : eveningStatus(record, closed, new Date(`${row.date}T23:59:59`));
    return {
      date: row.date,
      activityId: row.activityId,
      activityName: activityById.get(row.activityId) ?? "Activité",
      status,
      arrivedAt: row.arrivedAt,
      departedAt: row.leftAt,
    };
  });
}
