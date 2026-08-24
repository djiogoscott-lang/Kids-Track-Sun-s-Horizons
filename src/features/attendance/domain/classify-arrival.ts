import type { ArrivalClassification } from "./types";

/**
 * A monitor records only the fact of arrival; lateness is derived, never
 * chosen. `lateAfterMinutes` is the grace period past the session start.
 */
export function classifyArrival(
  sessionStartsAt: Date | string,
  lateAfterMinutes: number,
  arrivedAt: Date | string,
): ArrivalClassification {
  const startsAt = new Date(sessionStartsAt).getTime();
  const arrival = new Date(arrivedAt).getTime();
  const thresholdMs = lateAfterMinutes * 60_000;

  return arrival - startsAt > thresholdMs ? "LATE" : "ON_TIME";
}
