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
 * it is purely a function of whether the child has left and what time it is.
 */
export function eveningStatus(record: PresenceRecord, now: Date): EveningStatus {
  if (record.left) return "LEFT";
  return isPastDaycareCutoff(now) ? "DAYCARE" : "STILL_PRESENT";
}
