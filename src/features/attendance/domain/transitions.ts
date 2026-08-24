import type { AttendanceAction, AttendanceEventType, PresenceState } from "./types";

/**
 * The only presence transitions a monitor may perform as a normal action.
 * Anything not listed here (e.g. LEFT -> PRESENT) requires an explicit
 * correction instead of a regular workflow action.
 */
const ALLOWED_TRANSITIONS: Record<AttendanceAction, PresenceState[]> = {
  ARRIVE: ["EXPECTED", "ABSENT", "EXCUSED"],
  ABSENT: ["EXPECTED"],
  EXCUSE: ["EXPECTED"],
  DEPART: ["PRESENT"],
};

const ACTION_EVENT_TYPE: Record<AttendanceAction, AttendanceEventType> = {
  ARRIVE: "ARRIVED",
  ABSENT: "ABSENT",
  EXCUSE: "EXCUSED",
  DEPART: "LEFT",
};

export interface TransitionCheck {
  allowed: boolean;
  reason?: string;
  eventType: AttendanceEventType;
}

export function checkTransition(currentState: PresenceState, action: AttendanceAction): TransitionCheck {
  const eventType = ACTION_EVENT_TYPE[action];
  const allowedFrom = ALLOWED_TRANSITIONS[action];

  if (!allowedFrom.includes(currentState)) {
    return {
      allowed: false,
      eventType,
      reason: `L'action "${action}" n'est pas possible depuis l'état "${currentState}". Utilisez une correction si nécessaire.`,
    };
  }

  return { allowed: true, eventType };
}
