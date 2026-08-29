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

/**
 * NOT_MARKED is a real, distinct state — a child nobody has touched yet
 * today is not the same thing as a child a monitor explicitly marked
 * absent. The two look identical if you only ever look at `arrived: false`
 * on a record that exists; the difference is whether a record exists for
 * this child on this date at all. No attendance row for (child, date) means
 * NOT_MARKED — this is why child creation and activity moves must never
 * seed a placeholder attendance row (see createChild/updateChild in
 * commands.ts), and why callers pass `record | undefined` here instead of
 * defaulting to an empty record first.
 */
export type MorningStatus = "ARRIVED" | "ABSENT" | "NOT_MARKED";

export type EveningStatus = "LEFT" | "STILL_PRESENT" | "DAYCARE";

export function morningStatus(record: PresenceRecord | undefined): MorningStatus {
  if (!record) return "NOT_MARKED";
  return record.arrived ? "ARRIVED" : "ABSENT";
}
