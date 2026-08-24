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

export function formatDuration(startMs: number, endMs: number): string {
  const totalMinutes = Math.max(0, Math.round((endMs - startMs) / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  if (minutes === 0) return `${hours} h`;
  return `${hours} h ${minutes}`;
}
