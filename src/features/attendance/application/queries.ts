import { detectSessionAnomalies } from "@/features/attendance/domain/anomalies";
import type { PresenceState } from "@/features/attendance/domain/types";
import type { CurrentUser } from "@/lib/auth/session";
import { getDemoState } from "@/server/demo/store";
import type { DemoEvent, DemoParticipant, DemoSession } from "@/server/demo/types";

function groupOf(sessionId: string) {
  const state = getDemoState();
  const session = state.sessions.get(sessionId);
  if (!session) return null;
  const group = state.groups.find((g) => g.id === session.groupId);
  return group ?? null;
}

function participantsOf(sessionId: string): DemoParticipant[] {
  const state = getDemoState();
  return [...state.participants.values()].filter((p) => p.sessionId === sessionId);
}

export interface AttendanceCounters {
  expected: number;
  present: number;
  absent: number;
  excused: number;
  late: number;
  left: number;
  toProcess: number;
}

export function countAttendance(participants: DemoParticipant[]): AttendanceCounters {
  const counters: AttendanceCounters = { expected: 0, present: 0, absent: 0, excused: 0, late: 0, left: 0, toProcess: 0 };
  for (const p of participants) {
    if (p.presenceState === "EXPECTED") counters.expected += 1;
    if (p.presenceState === "PRESENT") counters.present += 1;
    if (p.presenceState === "ABSENT") counters.absent += 1;
    if (p.presenceState === "EXCUSED") counters.excused += 1;
    if (p.presenceState === "LEFT") counters.left += 1;
    if (p.arrivalClassification === "LATE" && (p.presenceState === "PRESENT" || p.presenceState === "LEFT")) {
      counters.late += 1;
    }
  }
  counters.toProcess = counters.expected;
  return counters;
}

export interface SessionSummary {
  id: string;
  groupName: string;
  ageRange: string;
  location: string;
  startsAt: Date;
  endsAt: Date;
  status: DemoSession["status"];
  counters: AttendanceCounters;
  monitorNames: string[];
}

function toSessionSummary(session: DemoSession): SessionSummary {
  const state = getDemoState();
  const group = state.groups.find((g) => g.id === session.groupId)!;
  const monitorNames = session.monitorIds.map((id) => state.users.find((u) => u.id === id)?.name ?? "Moniteur");
  return {
    id: session.id,
    groupName: group.name,
    ageRange: group.ageRange,
    location: group.location,
    startsAt: session.startsAt,
    endsAt: session.endsAt,
    status: session.status,
    counters: countAttendance(participantsOf(session.id)),
    monitorNames,
  };
}

export function listSessionsForUser(user: CurrentUser): SessionSummary[] {
  const state = getDemoState();
  const sessions = [...state.sessions.values()].filter((session) =>
    user.role === "ADMIN" ? true : session.monitorIds.includes(user.id),
  );
  return sessions.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime()).map(toSessionSummary);
}

export interface ParticipantView {
  id: string;
  childId: string;
  firstName: string;
  lastName: string;
  presenceState: PresenceState;
  arrivalClassification: DemoParticipant["arrivalClassification"];
  arrivedAt: Date | null;
  leftAt: Date | null;
}

export interface SessionAttendanceView {
  session: SessionSummary;
  participants: ParticipantView[];
}

export function getSessionAttendance(sessionId: string): SessionAttendanceView | null {
  const state = getDemoState();
  const session = state.sessions.get(sessionId);
  if (!session) return null;

  const participants = participantsOf(sessionId)
    .map((p) => {
      const child = state.children.get(p.childId)!;
      return {
        id: p.id,
        childId: p.childId,
        firstName: child.firstName,
        lastName: child.lastName,
        presenceState: p.presenceState,
        arrivalClassification: p.arrivalClassification,
        arrivedAt: p.arrivedAt,
        leftAt: p.leftAt,
      };
    })
    .sort((a, b) => `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`));

  return { session: toSessionSummary(session), participants };
}

export interface DashboardSummary {
  dateLabel: Date;
  totals: AttendanceCounters;
  activeSessionsCount: number;
  totalSessionsCount: number;
  anomaliesCount: number;
  sessions: SessionSummary[];
}

export function getDashboardSummary(now = new Date()): DashboardSummary {
  const state = getDemoState();
  const sessions = [...state.sessions.values()].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const summaries = sessions.map(toSessionSummary);

  const totals = summaries.reduce<AttendanceCounters>(
    (acc, s) => ({
      expected: acc.expected + s.counters.expected,
      present: acc.present + s.counters.present,
      absent: acc.absent + s.counters.absent,
      excused: acc.excused + s.counters.excused,
      late: acc.late + s.counters.late,
      left: acc.left + s.counters.left,
      toProcess: acc.toProcess + s.counters.toProcess,
    }),
    { expected: 0, present: 0, absent: 0, excused: 0, late: 0, left: 0, toProcess: 0 },
  );

  return {
    dateLabel: now,
    totals,
    activeSessionsCount: sessions.filter((s) => s.status !== "CLOSED").length,
    totalSessionsCount: sessions.length,
    anomaliesCount: listAnomalies(now).length,
    sessions: summaries,
  };
}

export interface AnomalyView {
  id: string;
  type: "CHILD_STILL_PRESENT" | "SESSION_NOT_CLOSED" | "CORRECTION_MADE";
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
  sessionId: string;
  sessionLabel: string;
  detectedAt: Date;
  status: "OPEN" | "RESOLVED";
  resolvable: boolean;
}

export function listAnomalies(now = new Date()): AnomalyView[] {
  const state = getDemoState();
  const views: AnomalyView[] = [];

  for (const session of state.sessions.values()) {
    const group = state.groups.find((g) => g.id === session.groupId)!;
    const participants = participantsOf(session.id);
    const names = new Map(participants.map((p) => [p.id, `${state.children.get(p.childId)?.firstName} ${state.children.get(p.childId)?.lastName}`]));
    const records = participants.map((p) => ({
      sessionParticipantId: p.id,
      childId: p.childId,
      presenceState: p.presenceState,
      arrivalClassification: p.arrivalClassification,
      arrivedAt: p.arrivedAt?.toISOString() ?? null,
      leftAt: p.leftAt?.toISOString() ?? null,
      lastEventId: p.lastEventId,
    }));
    const detected = detectSessionAnomalies(session, records, now, names);
    for (const anomaly of detected) {
      views.push({
        id: `${session.id}-${anomaly.type}-${anomaly.sessionParticipantId ?? "session"}`,
        type: anomaly.type,
        severity: anomaly.severity,
        description: anomaly.description,
        sessionId: session.id,
        sessionLabel: group.name,
        detectedAt: now,
        status: "OPEN",
        resolvable: false,
      });
    }
  }

  for (const correction of state.correctionAnomalies) {
    const session = state.sessions.get(correction.sessionId);
    const group = session ? state.groups.find((g) => g.id === session.groupId) : null;
    views.push({
      id: correction.id,
      type: "CORRECTION_MADE",
      severity: "LOW",
      description: correction.description,
      sessionId: correction.sessionId,
      sessionLabel: group?.name ?? "Séance",
      detectedAt: correction.detectedAt,
      status: correction.status,
      resolvable: true,
    });
  }

  return views.sort((a, b) => b.detectedAt.getTime() - a.detectedAt.getTime());
}

export function resolveAnomaly(anomalyId: string, resolvedBy: string): void {
  const state = getDemoState();
  const correction = state.correctionAnomalies.find((c) => c.id === anomalyId);
  if (!correction) return;
  correction.status = "RESOLVED";
  correction.resolvedAt = new Date();
  correction.resolvedBy = resolvedBy;
}

export interface HistoryEntry {
  id: string;
  childName: string;
  eventType: DemoEvent["eventType"];
  presenceStateAfter: DemoEvent["presenceStateAfter"];
  arrivalClassification: DemoEvent["arrivalClassification"];
  occurredAt: Date;
  recordedAt: Date;
  recordedByName: string;
  correctionReason: string | null;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
}

export function getSessionHistory(sessionId: string): HistoryEntry[] {
  const state = getDemoState();
  const events = state.eventsBySession.get(sessionId) ?? [];

  return [...events]
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber)
    .map((event) => {
      const participant = state.participants.get(event.sessionParticipantId);
      const child = participant ? state.children.get(participant.childId) : null;
      return {
        id: event.id,
        childName: child ? `${child.firstName} ${child.lastName}` : "Enfant",
        eventType: event.eventType,
        presenceStateAfter: event.presenceStateAfter,
        arrivalClassification: event.arrivalClassification,
        occurredAt: event.occurredAt,
        recordedAt: event.recordedAt,
        recordedByName: event.recordedByName,
        correctionReason: event.correctionReason,
        previousValue: event.previousValue,
        newValue: event.newValue,
      };
    })
    .reverse();
}

export function getGroupLocation(sessionId: string): { name: string; ageRange: string; location: string } | null {
  const group = groupOf(sessionId);
  return group ? { name: group.name, ageRange: group.ageRange, location: group.location } : null;
}
