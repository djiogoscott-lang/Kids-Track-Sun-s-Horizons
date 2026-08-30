/**
 * A child's day is built from independent stored facts, never a derived
 * "status" column: did they arrive, did they leave, and — separately —
 * were they placed in daycare manually today. Morning/evening/daycare
 * screens all derive their display from these plus the current time.
 * daycareManual is a same-day event, not a permanent registration — it
 * never touches children.daycareAuto or the child's activity.
 */
export interface PresenceRecord {
  childId: string;
  activityId: string;
  arrived: boolean;
  arrivedAt: Date | null;
  left: boolean;
  leftAt: Date | null;
  daycareManual: boolean;
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
