/**
 * A child's day has exactly two independent facts: did they arrive, and
 * did they leave. Everything shown on screen is derived from these two
 * booleans plus the current time — there is no third stored status.
 */
export interface PresenceRecord {
  childId: string;
  activityId: string;
  arrived: boolean;
  arrivedAt: Date | null;
  left: boolean;
  leftAt: Date | null;
}

export type MorningStatus = "ARRIVED" | "ABSENT";

export type EveningStatus = "LEFT" | "STILL_PRESENT" | "DAYCARE";

export function morningStatus(record: PresenceRecord): MorningStatus {
  return record.arrived ? "ARRIVED" : "ABSENT";
}
