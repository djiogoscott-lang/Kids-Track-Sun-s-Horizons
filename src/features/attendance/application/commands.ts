import { classifyArrival } from "@/features/attendance/domain/classify-arrival";
import { checkTransition } from "@/features/attendance/domain/transitions";
import type { AttendanceAction } from "@/features/attendance/domain/types";
import { getDemoState } from "@/server/demo/store";
import type { DemoEvent, DemoParticipant } from "@/server/demo/types";
import { AttendanceCommandError } from "./errors";

interface Actor {
  name: string;
}

function nextEventId(state: ReturnType<typeof getDemoState>): string {
  return `evt-${state.nextSequence}`;
}

function appendEvent(state: ReturnType<typeof getDemoState>, event: Omit<DemoEvent, "sequenceNumber">): DemoEvent {
  const fullEvent: DemoEvent = { ...event, sequenceNumber: state.nextSequence };
  state.nextSequence += 1;
  const list = state.eventsBySession.get(event.sessionId) ?? [];
  list.push(fullEvent);
  state.eventsBySession.set(event.sessionId, list);
  return fullEvent;
}

function requireOpenSession(sessionId: string) {
  const state = getDemoState();
  const session = state.sessions.get(sessionId);
  if (!session) throw new AttendanceCommandError("Séance introuvable.");
  if (session.status === "CLOSED") {
    throw new AttendanceCommandError("Cette séance est clôturée. Une correction administrative est nécessaire pour la modifier.");
  }
  return { state, session };
}

function requireParticipant(state: ReturnType<typeof getDemoState>, sessionId: string, participantId: string): DemoParticipant {
  const participant = state.participants.get(participantId);
  if (!participant || participant.sessionId !== sessionId) {
    throw new AttendanceCommandError("Enfant introuvable pour cette séance.");
  }
  return participant;
}

function assertTransition(participant: DemoParticipant, action: AttendanceAction) {
  const check = checkTransition(participant.presenceState, action);
  if (!check.allowed) throw new AttendanceCommandError(check.reason ?? "Action impossible.");
  return check;
}

export function recordArrival(sessionId: string, participantId: string, actor: Actor, occurredAt = new Date()): DemoParticipant {
  const { state, session } = requireOpenSession(sessionId);
  const participant = requireParticipant(state, sessionId, participantId);
  assertTransition(participant, "ARRIVE");

  const classification = classifyArrival(session.startsAt, session.lateAfterMinutes, occurredAt);

  appendEvent(state, {
    id: nextEventId(state),
    sessionId,
    sessionParticipantId: participantId,
    eventType: "ARRIVED",
    presenceStateAfter: null,
    arrivalClassification: classification,
    occurredAt,
    recordedAt: occurredAt,
    recordedByName: actor.name,
    correctedEventId: null,
    previousValue: null,
    newValue: null,
    correctionReason: null,
  });

  const presentEvent = appendEvent(state, {
    id: nextEventId(state),
    sessionId,
    sessionParticipantId: participantId,
    eventType: "PRESENT",
    presenceStateAfter: "PRESENT",
    arrivalClassification: classification,
    occurredAt,
    recordedAt: occurredAt,
    recordedByName: actor.name,
    correctedEventId: null,
    previousValue: null,
    newValue: null,
    correctionReason: null,
  });

  const updated: DemoParticipant = {
    ...participant,
    presenceState: "PRESENT",
    arrivalClassification: classification,
    arrivedAt: occurredAt,
    lastEventId: presentEvent.id,
  };
  state.participants.set(participantId, updated);
  return updated;
}

export function recordAbsence(sessionId: string, participantId: string, actor: Actor, occurredAt = new Date()): DemoParticipant {
  const { state } = requireOpenSession(sessionId);
  const participant = requireParticipant(state, sessionId, participantId);
  assertTransition(participant, "ABSENT");

  const event = appendEvent(state, {
    id: nextEventId(state),
    sessionId,
    sessionParticipantId: participantId,
    eventType: "ABSENT",
    presenceStateAfter: "ABSENT",
    arrivalClassification: null,
    occurredAt,
    recordedAt: occurredAt,
    recordedByName: actor.name,
    correctedEventId: null,
    previousValue: null,
    newValue: null,
    correctionReason: null,
  });

  const updated: DemoParticipant = { ...participant, presenceState: "ABSENT", lastEventId: event.id };
  state.participants.set(participantId, updated);
  return updated;
}

export function recordExcused(sessionId: string, participantId: string, actor: Actor, occurredAt = new Date()): DemoParticipant {
  const { state } = requireOpenSession(sessionId);
  const participant = requireParticipant(state, sessionId, participantId);
  assertTransition(participant, "EXCUSE");

  const event = appendEvent(state, {
    id: nextEventId(state),
    sessionId,
    sessionParticipantId: participantId,
    eventType: "EXCUSED",
    presenceStateAfter: "EXCUSED",
    arrivalClassification: null,
    occurredAt,
    recordedAt: occurredAt,
    recordedByName: actor.name,
    correctedEventId: null,
    previousValue: null,
    newValue: null,
    correctionReason: null,
  });

  const updated: DemoParticipant = { ...participant, presenceState: "EXCUSED", lastEventId: event.id };
  state.participants.set(participantId, updated);
  return updated;
}

export function recordDeparture(sessionId: string, participantId: string, actor: Actor, occurredAt = new Date()): DemoParticipant {
  const { state } = requireOpenSession(sessionId);
  const participant = requireParticipant(state, sessionId, participantId);
  assertTransition(participant, "DEPART");

  const event = appendEvent(state, {
    id: nextEventId(state),
    sessionId,
    sessionParticipantId: participantId,
    eventType: "LEFT",
    presenceStateAfter: "LEFT",
    arrivalClassification: null,
    occurredAt,
    recordedAt: occurredAt,
    recordedByName: actor.name,
    correctedEventId: null,
    previousValue: null,
    newValue: null,
    correctionReason: null,
  });

  const updated: DemoParticipant = { ...participant, presenceState: "LEFT", leftAt: occurredAt, lastEventId: event.id };
  state.participants.set(participantId, updated);
  return updated;
}

/**
 * Corrections never rewrite history: they append a CORRECTION event that
 * points at what it corrects and carries both values, then update the
 * projection. Only the departure time is correctable in V0.1.
 */
export function correctDeparture(
  sessionId: string,
  participantId: string,
  newLeftAt: Date,
  reason: string,
  actor: Actor,
): DemoParticipant {
  // Corrections are the one action deliberately allowed on a closed
  // session: fixing a mistaken departure time must not require reopening
  // the whole session as if it were still active.
  const state = getDemoState();
  const session = state.sessions.get(sessionId);
  if (!session) throw new AttendanceCommandError("Séance introuvable.");
  const participant = requireParticipant(state, sessionId, participantId);

  if (participant.presenceState !== "LEFT" || !participant.lastEventId) {
    throw new AttendanceCommandError("Seul un départ déjà enregistré peut être corrigé.");
  }
  if (!reason.trim()) {
    throw new AttendanceCommandError("Un motif est requis pour toute correction.");
  }

  const previousLeftAt = participant.leftAt;
  const correctionEvent = appendEvent(state, {
    id: nextEventId(state),
    sessionId,
    sessionParticipantId: participantId,
    eventType: "CORRECTION",
    presenceStateAfter: "LEFT",
    arrivalClassification: null,
    occurredAt: newLeftAt,
    recordedAt: new Date(),
    recordedByName: actor.name,
    correctedEventId: participant.lastEventId,
    previousValue: { leftAt: previousLeftAt?.toISOString() ?? null },
    newValue: { leftAt: newLeftAt.toISOString() },
    correctionReason: reason,
  });

  const updated: DemoParticipant = { ...participant, leftAt: newLeftAt, lastEventId: correctionEvent.id };
  state.participants.set(participantId, updated);

  state.auditLog.push({
    id: `audit-${correctionEvent.id}`,
    actorName: actor.name,
    action: "CORRECTION",
    entityType: "attendance_event",
    entityId: correctionEvent.id,
    metadata: {
      sessionId,
      previousValue: { leftAt: previousLeftAt?.toISOString() ?? null },
      newValue: { leftAt: newLeftAt.toISOString() },
      reason,
    },
    recordedAt: new Date(),
  });

  state.correctionAnomalies.push({
    id: `anomaly-${correctionEvent.id}`,
    sessionId,
    description: `Correction de l'heure de départ enregistrée par ${actor.name}.`,
    status: "OPEN",
    detectedAt: new Date(),
    resolvedAt: null,
    resolvedBy: null,
  });

  return updated;
}

export interface CloseSessionResult {
  closed: boolean;
  stillPresentCount: number;
}

/**
 * Closing never fabricates a departure time. If children are still marked
 * present the caller must pass `force: true` after an explicit warning.
 */
export function closeSession(sessionId: string, actor: Actor, options: { force?: boolean; note?: string } = {}): CloseSessionResult {
  const state = getDemoState();
  const session = state.sessions.get(sessionId);
  if (!session) throw new AttendanceCommandError("Séance introuvable.");
  if (session.status === "CLOSED") throw new AttendanceCommandError("Cette séance est déjà clôturée.");

  const participants = [...state.participants.values()].filter((p) => p.sessionId === sessionId);
  const stillPresentCount = participants.filter((p) => p.presenceState === "PRESENT").length;

  if (stillPresentCount > 0 && !options.force) {
    return { closed: false, stillPresentCount };
  }

  state.sessions.set(sessionId, { ...session, status: "CLOSED", closedAt: new Date(), closedBy: actor.name });

  state.auditLog.push({
    id: `audit-close-${sessionId}-${Date.now()}`,
    actorName: actor.name,
    action: "CLOSE_SESSION",
    entityType: "session",
    entityId: sessionId,
    metadata: { stillPresentCount, note: options.note ?? null },
    recordedAt: new Date(),
  });

  return { closed: true, stillPresentCount };
}
