import type { AttendanceRecord } from "./types";

export const ANOMALY_TYPES = [
  "CHILD_STILL_PRESENT",
  "SESSION_NOT_CLOSED",
  "CORRECTION_MADE",
] as const;
export type AnomalyType = (typeof ANOMALY_TYPES)[number];

export const ANOMALY_SEVERITIES = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
export type AnomalySeverity = (typeof ANOMALY_SEVERITIES)[number];

export interface DetectedAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  description: string;
  sessionParticipantId?: string;
}

export interface SessionForAnomalyCheck {
  id: string;
  endsAt: string | Date;
  status: "SCHEDULED" | "ACTIVE" | "CLOSING" | "CLOSED";
}

const CLOSURE_GRACE_MINUTES = 15;

function toTime(value: string | Date): number {
  return value instanceof Date ? value.getTime() : new Date(value).getTime();
}

/**
 * Children still marked PRESENT once a session has ended: the single most
 * common paper-sheet failure this product replaces (a forgotten departure).
 */
export function detectChildrenStillPresent(
  session: SessionForAnomalyCheck,
  records: AttendanceRecord[],
  now: Date,
  childNameByParticipantId: Map<string, string>,
): DetectedAnomaly[] {
  if (session.status === "CLOSED") return [];
  if (now.getTime() < toTime(session.endsAt)) return [];

  return records
    .filter((record) => record.presenceState === "PRESENT")
    .map((record) => ({
      type: "CHILD_STILL_PRESENT" as const,
      severity: "HIGH" as const,
      sessionParticipantId: record.sessionParticipantId,
      description: `${childNameByParticipantId.get(record.sessionParticipantId) ?? "Un enfant"} est toujours enregistré comme présent.`,
    }));
}

/**
 * A session left open well past its scheduled end is itself an anomaly,
 * independent of whether any individual child is still present.
 */
export function detectSessionNotClosed(session: SessionForAnomalyCheck, now: Date): DetectedAnomaly[] {
  if (session.status === "CLOSED") return [];

  const graceMs = CLOSURE_GRACE_MINUTES * 60_000;
  if (now.getTime() < toTime(session.endsAt) + graceMs) return [];

  return [
    {
      type: "SESSION_NOT_CLOSED",
      severity: "MEDIUM",
      description: "Cette séance est terminée depuis plus de 15 minutes et n'a pas été clôturée.",
    },
  ];
}

export function detectSessionAnomalies(
  session: SessionForAnomalyCheck,
  records: AttendanceRecord[],
  now: Date,
  childNameByParticipantId: Map<string, string>,
): DetectedAnomaly[] {
  return [
    ...detectChildrenStillPresent(session, records, now, childNameByParticipantId),
    ...detectSessionNotClosed(session, now),
  ];
}
