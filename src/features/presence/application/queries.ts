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
  getRosterForWeek,
  getUnreadCountForActivityData,
  wasRosterWeekEverActivated,
  weekBounds,
  type ChildRecord,
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
 * Maps each active child to the activity they effectively belong to for the
 * week containing `date`. If a roster has been built for that week (any
 * activity — see below), it is authoritative and children.activityId is
 * ignored: a roster row's activityId is what actually places a child in
 * this week's session, so a child can move activities week to week without
 * touching their permanent profile. If NO roster row exists anywhere for
 * that week — every date before this feature shipped, or a future week
 * nobody has built yet — this falls back to the legacy rule
 * (children.activityId + active), so existing history and any week the
 * admin hasn't gotten to yet keep working exactly as before rather than
 * silently showing zero children.
 *
 * The "any activity" check (not "this activity") matters: once the org has
 * started managing rosters for a week, every activity for that week should
 * behave in roster-mode, including one with a genuinely empty roster (0
 * participants is a real, correct answer once rosters are in use) — mixing
 * roster-mode and legacy-mode per-activity within the same week would be
 * confusing and inconsistent.
 */
async function resolveEffectiveActivityMap(allChildren: ChildRecord[], date: Date): Promise<Map<string, string>> {
  const { weekStart } = weekBounds(date);
  const roster = await getRosterForWeek(weekStart);
  if (roster.length === 0) {
    // Empty is the common, expected case for any week that never had a
    // roster built — only pay for the extra "was this ever activated?"
    // check here (not on every page load) so an anomalous empty week still
    // gets flagged in the server logs even if nobody happens to open
    // /admin/roster to see the banner.
    if (await wasRosterWeekEverActivated(weekStart)) {
      console.error(`ANOMALIE weekly_roster: repli silencieux evite pour la semaine ${weekStart} (roster active mais vide).`);
    }
    return new Map(allChildren.filter((c) => c.active).map((c) => [c.id, c.activityId]));
  }
  return new Map(roster.map((r) => [r.childId, r.activityId]));
}

async function resolveRosterChildren(activityId: string, allChildren: ChildRecord[], date: Date): Promise<ChildRecord[]> {
  const effectiveActivity = await resolveEffectiveActivityMap(allChildren, date);
  return allChildren.filter((c) => c.active && effectiveActivity.get(c.id) === activityId);
}

/**
 * Single-child version of resolveEffectiveActivityMap, for call sites (write
 * actions) that need one child's real activity for this week rather than
 * the whole roster. Returns null once roster-mode is active for the week
 * and this child simply isn't on any roster — "not currently eligible
 * anywhere", not "fall back to their old activity".
 */
export async function getEffectiveActivityIdForChild(childId: string, date = new Date()): Promise<string | null> {
  const child = await getChildById(childId);
  if (!child) return null;
  const { weekStart } = weekBounds(date);
  const roster = await getRosterForWeek(weekStart);
  if (roster.length === 0) return child.active ? child.activityId : null;
  return roster.find((r) => r.childId === childId)?.activityId ?? null;
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
      const children = await resolveRosterChildren(activity.id, allChildren, now);
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

  const [dayState, records, allChildren] = await Promise.all([getDayState(activityId, now), getAttendanceMap(now, activityId), getChildrenList()]);
  const children = sortByName(await resolveRosterChildren(activityId, allChildren, now));

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
  const childById = new Map(allChildren.map((c) => [c.id, c]));
  const rows: DaycareRow[] = [];

  // Keyed off the attendance record's own activityId, not children.activityId
  // — now that the weekly roster can place a child under a different
  // activity than their permanent reference one, record.activityId is the
  // one they were actually marked under today, and is what a monitor's own
  // Garderie view must match against.
  for (const [childId, record] of records) {
    const child = childById.get(childId);
    if (!child || !child.active) continue;
    const activity = activities.find((a) => a.id === record.activityId);
    if (!activity) continue;

    const closed = dayStates.get(record.activityId)?.closed ?? false;
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
 * Backs the Garderie "+ Ajouter un enfant" search: built from this week's
 * roster (an admin sees every activity's roster, a monitor only their own —
 * same scope getDaycareList itself already enforces), so the picker never
 * even shows a child the add action would go on to reject server-side
 * anyway, and never offers a child who isn't actually part of this week.
 */
export async function listChildrenForDaycarePicker(activityId?: string, now = new Date()): Promise<ChildPickerRow[]> {
  const [allChildren, activities] = await Promise.all([getChildrenList(), getActivitiesList()]);
  const effectiveActivity = await resolveEffectiveActivityMap(allChildren, now);
  const activityById = new Map(activities.map((a) => [a.id, a.name]));
  return sortByName(
    allChildren
      .filter((c) => {
        if (!c.active) return false;
        const effective = effectiveActivity.get(c.id);
        if (!effective) return false;
        return !activityId || effective === activityId;
      })
      .map((c) => ({
        id: c.id,
        firstName: c.firstName,
        lastName: c.lastName,
        activityId: effectiveActivity.get(c.id)!,
        activityName: activityById.get(effectiveActivity.get(c.id)!) ?? "Activité",
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
  /** Profile details — admin-only, like every other field on this row. This
   * shape is never handed to a monitor screen. */
  schoolClass: string;
  birthDate: string;
  phone: string;
  email: string;
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

// ---------------------------------------------------------------------------
// Weekly roster — admin management view ("Participants de la semaine").
// ---------------------------------------------------------------------------

export interface RosterParticipant {
  childId: string;
  firstName: string;
  lastName: string;
}

export interface RosterByActivity {
  activityId: string;
  activityName: string;
  participants: RosterParticipant[];
}

export async function getRosterForWeekView(weekStart: string): Promise<RosterByActivity[]> {
  const [roster, allChildren, activities] = await Promise.all([getRosterForWeek(weekStart), getChildrenList(), getActivitiesList()]);
  const childById = new Map(allChildren.map((c) => [c.id, c]));
  const byActivity = new Map<string, RosterParticipant[]>();
  for (const entry of roster) {
    const child = childById.get(entry.childId);
    if (!child) continue;
    if (!byActivity.has(entry.activityId)) byActivity.set(entry.activityId, []);
    byActivity.get(entry.activityId)!.push({ childId: child.id, firstName: child.firstName, lastName: child.lastName });
  }
  return activities.map((a) => ({
    activityId: a.id,
    activityName: a.name,
    participants: sortByName(byActivity.get(a.id) ?? []),
  }));
}
