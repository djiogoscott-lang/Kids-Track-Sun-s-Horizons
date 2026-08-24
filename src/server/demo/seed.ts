import { nameAt } from "./names";
import type {
  DemoAuditEntry,
  DemoChild,
  DemoCorrectionAnomaly,
  DemoEvent,
  DemoGroup,
  DemoParticipant,
  DemoSession,
  DemoUser,
} from "./types";

export interface DemoState {
  users: DemoUser[];
  groups: DemoGroup[];
  children: Map<string, DemoChild>;
  sessions: Map<string, DemoSession>;
  participants: Map<string, DemoParticipant>;
  eventsBySession: Map<string, DemoEvent[]>;
  auditLog: DemoAuditEntry[];
  correctionAnomalies: DemoCorrectionAnomaly[];
  nextSequence: number;
}

const MINUTE = 60_000;
const at = (base: Date, minutes: number) => new Date(base.getTime() + minutes * MINUTE);

let childCounter = 0;
function nextChild(children: Map<string, DemoChild>): DemoChild {
  childCounter += 1;
  const { firstName, lastName } = nameAt(childCounter);
  const child: DemoChild = { id: `child-${childCounter}`, firstName, lastName };
  children.set(child.id, child);
  return child;
}

interface SessionPlan {
  id: string;
  groupId: string;
  startsAt: Date;
  endsAt: Date;
  lateAfterMinutes: number;
  status: "SCHEDULED" | "ACTIVE" | "CLOSED";
  closedAt: Date | null;
  closedBy: string | null;
  monitorIds: string[];
  headcount: number;
}

/**
 * Builds a self-contained, realistic dataset anchored on `now` so the demo
 * always looks live: one session mid-way through with a few children still
 * unprocessed, one session overdue with children still present (an
 * anomaly), one closed session with a corrected departure, and five
 * upcoming sessions later today.
 */
export function buildDemoState(now: Date): DemoState {
  const users: DemoUser[] = [
    { id: "user-admin", name: "Jean Dupont", role: "ADMIN" },
    { id: "user-monitor-1", name: "Marie Lambert", role: "MONITOR" },
    { id: "user-monitor-2", name: "Karim El Amrani", role: "MONITOR" },
  ];

  const groups: DemoGroup[] = [
    { id: "group-multisports", name: "Multisports 6–10 ans", ageRange: "6–10 ans", location: "Complexe sportif communal" },
    { id: "group-baby-tennis", name: "Baby Tennis 3–6 ans", ageRange: "3–6 ans", location: "Tennis Club Horizons" },
    { id: "group-badminton", name: "Badminton 7+ ans", ageRange: "7+ ans", location: "Hall omnisports" },
    { id: "group-escalade", name: "Escalade 8–12 ans", ageRange: "8–12 ans", location: "Mur d'escalade Horizons" },
    { id: "group-danse", name: "Danse 5–10 ans", ageRange: "5–10 ans", location: "Salle polyvalente" },
    { id: "group-mini-tennis", name: "Mini-Tennis 4–6 ans", ageRange: "4–6 ans", location: "Tennis Club Horizons" },
    { id: "group-psychomotricite", name: "Psychomotricité 3–5 ans", ageRange: "3–5 ans", location: "Salle polyvalente" },
    { id: "group-parkour", name: "Parkour 9–14 ans", ageRange: "9–14 ans", location: "Complexe sportif communal" },
  ];

  const plans: SessionPlan[] = [
    {
      id: "session-multisports",
      groupId: "group-multisports",
      startsAt: at(now, -15),
      endsAt: at(now, 105),
      lateAfterMinutes: 5,
      status: "ACTIVE",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-1"],
      headcount: 24,
    },
    {
      id: "session-baby-tennis",
      groupId: "group-baby-tennis",
      startsAt: at(now, -140),
      endsAt: at(now, -20),
      lateAfterMinutes: 10,
      status: "ACTIVE",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-1"],
      headcount: 12,
    },
    {
      id: "session-badminton",
      groupId: "group-badminton",
      startsAt: at(now, -300),
      endsAt: at(now, -180),
      lateAfterMinutes: 10,
      status: "CLOSED",
      closedAt: at(now, -165),
      closedBy: "Karim El Amrani",
      monitorIds: ["user-monitor-2"],
      headcount: 20,
    },
    {
      id: "session-escalade",
      groupId: "group-escalade",
      startsAt: at(now, 60),
      endsAt: at(now, 180),
      lateAfterMinutes: 10,
      status: "SCHEDULED",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-2"],
      headcount: 16,
    },
    {
      id: "session-danse",
      groupId: "group-danse",
      startsAt: at(now, 150),
      endsAt: at(now, 240),
      lateAfterMinutes: 10,
      status: "SCHEDULED",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-1"],
      headcount: 18,
    },
    {
      id: "session-mini-tennis",
      groupId: "group-mini-tennis",
      startsAt: at(now, 180),
      endsAt: at(now, 240),
      lateAfterMinutes: 10,
      status: "SCHEDULED",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-2"],
      headcount: 14,
    },
    {
      id: "session-psychomotricite",
      groupId: "group-psychomotricite",
      startsAt: at(now, 240),
      endsAt: at(now, 300),
      lateAfterMinutes: 10,
      status: "SCHEDULED",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-1"],
      headcount: 12,
    },
    {
      id: "session-parkour",
      groupId: "group-parkour",
      startsAt: at(now, 270),
      endsAt: at(now, 360),
      lateAfterMinutes: 10,
      status: "SCHEDULED",
      closedAt: null,
      closedBy: null,
      monitorIds: ["user-monitor-2"],
      headcount: 12,
    },
  ];

  const children = new Map<string, DemoChild>();
  const sessions = new Map<string, DemoSession>();
  const participants = new Map<string, DemoParticipant>();
  const eventsBySession = new Map<string, DemoEvent[]>();
  const auditLog: DemoAuditEntry[] = [];
  const correctionAnomalies: DemoCorrectionAnomaly[] = [];
  let sequence = 1;
  let participantCounter = 0;
  let eventCounter = 0;

  function pushEvent(sessionId: string, event: DemoEvent) {
    const list = eventsBySession.get(sessionId) ?? [];
    list.push(event);
    eventsBySession.set(sessionId, list);
  }

  for (const plan of plans) {
    sessions.set(plan.id, {
      id: plan.id,
      groupId: plan.groupId,
      startsAt: plan.startsAt,
      endsAt: plan.endsAt,
      lateAfterMinutes: plan.lateAfterMinutes,
      status: plan.status,
      closedAt: plan.closedAt,
      closedBy: plan.closedBy,
      monitorIds: plan.monitorIds,
    });

    for (let i = 0; i < plan.headcount; i += 1) {
      const child = nextChild(children);
      participantCounter += 1;
      const participantId = `sp-${participantCounter}`;

      participants.set(participantId, {
        id: participantId,
        sessionId: plan.id,
        childId: child.id,
        presenceState: "EXPECTED",
        arrivalClassification: "UNKNOWN",
        arrivedAt: null,
        leftAt: null,
        lastEventId: null,
      });
    }
  }

  function recordArrival(
    sessionId: string,
    participantId: string,
    arrivedAt: Date,
    classification: "ON_TIME" | "LATE",
    monitorName: string,
  ) {
    eventCounter += 1;
    const arrivedEventId = `evt-${eventCounter}`;
    pushEvent(sessionId, {
      id: arrivedEventId,
      sessionId,
      sessionParticipantId: participantId,
      sequenceNumber: sequence++,
      eventType: "ARRIVED",
      presenceStateAfter: null,
      arrivalClassification: classification,
      occurredAt: arrivedAt,
      recordedAt: arrivedAt,
      recordedByName: monitorName,
      correctedEventId: null,
      previousValue: null,
      newValue: null,
      correctionReason: null,
    });

    eventCounter += 1;
    const presentEventId = `evt-${eventCounter}`;
    pushEvent(sessionId, {
      id: presentEventId,
      sessionId,
      sessionParticipantId: participantId,
      sequenceNumber: sequence++,
      eventType: "PRESENT",
      presenceStateAfter: "PRESENT",
      arrivalClassification: classification,
      occurredAt: arrivedAt,
      recordedAt: arrivedAt,
      recordedByName: monitorName,
      correctedEventId: null,
      previousValue: null,
      newValue: null,
      correctionReason: null,
    });

    const participant = participants.get(participantId)!;
    participants.set(participantId, {
      ...participant,
      presenceState: "PRESENT",
      arrivalClassification: classification,
      arrivedAt,
      lastEventId: presentEventId,
    });

    return presentEventId;
  }

  function recordAbsence(sessionId: string, participantId: string, at2: Date, monitorName: string) {
    eventCounter += 1;
    const eventId = `evt-${eventCounter}`;
    pushEvent(sessionId, {
      id: eventId,
      sessionId,
      sessionParticipantId: participantId,
      sequenceNumber: sequence++,
      eventType: "ABSENT",
      presenceStateAfter: "ABSENT",
      arrivalClassification: null,
      occurredAt: at2,
      recordedAt: at2,
      recordedByName: monitorName,
      correctedEventId: null,
      previousValue: null,
      newValue: null,
      correctionReason: null,
    });

    const participant = participants.get(participantId)!;
    participants.set(participantId, { ...participant, presenceState: "ABSENT", lastEventId: eventId });
  }

  function recordDeparture(sessionId: string, participantId: string, leftAt: Date, monitorName: string) {
    eventCounter += 1;
    const eventId = `evt-${eventCounter}`;
    pushEvent(sessionId, {
      id: eventId,
      sessionId,
      sessionParticipantId: participantId,
      sequenceNumber: sequence++,
      eventType: "LEFT",
      presenceStateAfter: "LEFT",
      arrivalClassification: null,
      occurredAt: leftAt,
      recordedAt: leftAt,
      recordedByName: monitorName,
      correctedEventId: null,
      previousValue: null,
      newValue: null,
      correctionReason: null,
    });

    const participant = participants.get(participantId)!;
    participants.set(participantId, { ...participant, presenceState: "LEFT", leftAt, lastEventId: eventId });
    return eventId;
  }

  // --- Session 1: Multisports, live in progress ---------------------------
  const multisportsParticipants = [...participants.values()].filter((p) => p.sessionId === "session-multisports");
  const s1Start = plans[0].startsAt;
  multisportsParticipants.slice(0, 15).forEach((p, i) => {
    recordArrival(p.sessionId, p.id, at(s1Start, 2 + i * 0.4), "ON_TIME", "Marie Lambert");
  });
  multisportsParticipants.slice(15, 17).forEach((p, i) => {
    recordArrival(p.sessionId, p.id, at(s1Start, 12 + i * 3), "LATE", "Marie Lambert");
  });
  multisportsParticipants.slice(17, 21).forEach((p) => {
    recordAbsence(p.sessionId, p.id, at(s1Start, 5), "Marie Lambert");
  });
  // The remaining 3 stay EXPECTED so the live demo has real work to do.

  // --- Session 2: Baby Tennis, overdue and not closed ----------------------
  const babyTennisParticipants = [...participants.values()].filter((p) => p.sessionId === "session-baby-tennis");
  const s2Start = plans[1].startsAt;
  const s2End = plans[1].endsAt;
  babyTennisParticipants.slice(0, 9).forEach((p, i) => {
    recordArrival(p.sessionId, p.id, at(s2Start, 3 + i), "ON_TIME", "Marie Lambert");
    recordDeparture(p.sessionId, p.id, at(s2End, -10 + i), "Marie Lambert");
  });
  babyTennisParticipants.slice(9, 10).forEach((p) => {
    recordAbsence(p.sessionId, p.id, at(s2Start, 5), "Marie Lambert");
  });
  babyTennisParticipants.slice(10, 12).forEach((p, i) => {
    recordArrival(p.sessionId, p.id, at(s2Start, 4 + i), "ON_TIME", "Marie Lambert");
  });
  // Two children never got a recorded departure: exactly the anomaly this
  // product exists to surface.

  // --- Session 3: Badminton, closed, with one correction -------------------
  const badmintonParticipants = [...participants.values()].filter((p) => p.sessionId === "session-badminton");
  const s3Start = plans[2].startsAt;
  const s3End = plans[2].endsAt;
  badmintonParticipants.slice(0, 18).forEach((p, i) => {
    recordArrival(p.sessionId, p.id, at(s3Start, 2 + i * 0.5), "ON_TIME", "Karim El Amrani");
    recordDeparture(p.sessionId, p.id, at(s3End, -15 + i * 0.4), "Karim El Amrani");
  });
  badmintonParticipants.slice(18, 20).forEach((p) => {
    recordAbsence(p.sessionId, p.id, at(s3Start, 5), "Karim El Amrani");
  });

  // Correct the last departure: recorded 16:40, actually left at 16:55.
  const correctedParticipant = badmintonParticipants[17];
  const wrongLeftAt = at(s3End, -20);
  const correctedLeftAt = at(s3End, -5);
  const originalDepartureEventId = recordDeparture(correctedParticipant.sessionId, correctedParticipant.id, wrongLeftAt, "Karim El Amrani");

  eventCounter += 1;
  const correctionEventId = `evt-${eventCounter}`;
  pushEvent(correctedParticipant.sessionId, {
    id: correctionEventId,
    sessionId: correctedParticipant.sessionId,
    sessionParticipantId: correctedParticipant.id,
    sequenceNumber: sequence++,
    eventType: "CORRECTION",
    presenceStateAfter: "LEFT",
    arrivalClassification: null,
    occurredAt: correctedLeftAt,
    recordedAt: at(correctedLeftAt, 6),
    recordedByName: "Karim El Amrani",
    correctedEventId: originalDepartureEventId,
    previousValue: { leftAt: wrongLeftAt.toISOString() },
    newValue: { leftAt: correctedLeftAt.toISOString() },
    correctionReason: "Erreur de saisie : l'heure de départ notée était trop tôt.",
  });

  const correctedRecord = participants.get(correctedParticipant.id)!;
  participants.set(correctedParticipant.id, { ...correctedRecord, leftAt: correctedLeftAt, lastEventId: correctionEventId });

  auditLog.push({
    id: "audit-1",
    actorName: "Karim El Amrani",
    action: "CORRECTION",
    entityType: "attendance_event",
    entityId: correctionEventId,
    metadata: {
      sessionId: correctedParticipant.sessionId,
      previousValue: { leftAt: wrongLeftAt.toISOString() },
      newValue: { leftAt: correctedLeftAt.toISOString() },
      reason: "Erreur de saisie : l'heure de départ notée était trop tôt.",
    },
    recordedAt: at(correctedLeftAt, 6),
  });

  correctionAnomalies.push({
    id: "anomaly-correction-1",
    sessionId: correctedParticipant.sessionId,
    description: "Correction de l'heure de départ d'un enfant sur Badminton 7+ ans.",
    status: "OPEN",
    detectedAt: at(correctedLeftAt, 6),
    resolvedAt: null,
    resolvedBy: null,
  });

  auditLog.push({
    id: "audit-2",
    actorName: "Karim El Amrani",
    action: "CLOSE_SESSION",
    entityType: "session",
    entityId: "session-badminton",
    metadata: {},
    recordedAt: plans[2].closedAt as Date,
  });

  return {
    users,
    groups,
    children,
    sessions,
    participants,
    eventsBySession,
    auditLog,
    correctionAnomalies,
    nextSequence: sequence,
  };
}
