import type { EveningStatus, PresenceRecord } from "./types";

const TIME_ZONE = "Europe/Brussels";

/** Children still on-site past this local time are considered in daycare, not "awaiting pickup". */
export const DAYCARE_CUTOFF_HOUR = 16;
export const DAYCARE_CUTOFF_MINUTE = 15;

export function isPastDaycareCutoff(now: Date): boolean {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).formatToParts(now);

  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");

  return hour > DAYCARE_CUTOFF_HOUR || (hour === DAYCARE_CUTOFF_HOUR && minute >= DAYCARE_CUTOFF_MINUTE);
}

/**
 * The evening status is never chosen by the monitor for the DAYCARE case —
 * it follows automatically once the activity is closed for the day, or once
 * it is simply past the cutoff time, whichever comes first.
 */
export function eveningStatus(record: PresenceRecord, activityClosed: boolean, now: Date): EveningStatus {
  if (record.left) return "LEFT";
  return activityClosed || isPastDaycareCutoff(now) ? "DAYCARE" : "STILL_PRESENT";
}

export type DaycareReason = "PLANNED" | "AFTER_SESSION";

/**
 * PLANNED covers a child registered for daycare from the morning — they
 * appear as soon as they arrive, never waiting on the clock or a closure.
 * AFTER_SESSION covers anyone still on-site once their activity's day ends,
 * whether that end came from an explicit closure or the automatic cutoff.
 */
export function daycareReason(
  record: PresenceRecord,
  daycareAuto: boolean,
  activityClosed: boolean,
  now: Date,
): DaycareReason | null {
  if (!record.arrived || record.left) return null;
  if (daycareAuto) return "PLANNED";
  return activityClosed || isPastDaycareCutoff(now) ? "AFTER_SESSION" : null;
}
