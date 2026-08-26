const TIME_ZONE = "Europe/Brussels";

export function formatTime(date: Date): string {
  return new Intl.DateTimeFormat("fr-BE", { hour: "2-digit", minute: "2-digit", timeZone: TIME_ZONE }).format(date);
}

export function formatDateLong(date: Date): string {
  const formatted = new Intl.DateTimeFormat("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: TIME_ZONE,
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** Same as formatDateLong, plus the year — history spans years, "today" doesn't need to. */
export function formatDateWithYear(date: Date): string {
  const formatted = new Intl.DateTimeFormat("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: TIME_ZONE,
  }).format(date);
  return formatted.charAt(0).toUpperCase() + formatted.slice(1);
}

/** yyyy-mm-dd in the org's timezone — the canonical key used in URLs and in Supabase's `date` columns. */
export function toDateKey(date: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TIME_ZONE }).format(date);
}

/** Parses a yyyy-mm-dd key back into a Date. Invalid input falls back to today rather than crashing a page over a hand-edited URL. */
export function parseDateKey(key: string | undefined): Date {
  if (key && /^\d{4}-\d{2}-\d{2}$/.test(key)) {
    const parsed = new Date(`${key}T12:00:00`);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return new Date();
}

export function formatDuration(startMs: number, endMs: number): string {
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes}`;
}
