export const PRESENCE_STATES = ["EXPECTED", "ABSENT", "EXCUSED", "PRESENT", "LEFT"] as const;
export type PresenceState = (typeof PRESENCE_STATES)[number];

export const ARRIVAL_CLASSIFICATIONS = ["UNKNOWN", "ON_TIME", "LATE"] as const;
export type ArrivalClassification = (typeof ARRIVAL_CLASSIFICATIONS)[number];

export const ATTENDANCE_EVENT_TYPES = [
  "EXPECTED",
  "ARRIVED",
  "PRESENT",
  "ABSENT",
  "EXCUSED",
  "LEFT",
  "CORRECTION",
] as const;
export type AttendanceEventType = (typeof ATTENDANCE_EVENT_TYPES)[number];

export interface AttendanceRecord {
  sessionParticipantId: string;
  childId: string;
  presenceState: PresenceState;
  arrivalClassification: ArrivalClassification;
  arrivedAt: string | null;
  leftAt: string | null;
  lastEventId: string | null;
}

export interface AttendanceEvent {
  id: string;
  sessionParticipantId: string;
  sequenceNumber: number;
  eventType: AttendanceEventType;
  presenceStateAfter: PresenceState | null;
  arrivalClassification: ArrivalClassification | null;
  occurredAt: string;
  recordedAt: string;
  recordedByName: string;
  correctedEventId?: string | null;
  previousValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  correctionReason?: string | null;
}

/**
 * The four actions a monitor can take from the attendance screen. Each maps
 * to one or more domain events depending on the record's current state.
 */
export type AttendanceAction = "ARRIVE" | "ABSENT" | "EXCUSE" | "DEPART";
