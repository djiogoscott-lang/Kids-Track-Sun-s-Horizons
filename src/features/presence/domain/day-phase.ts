const TIME_ZONE = "Europe/Brussels";

export type DayPhaseId = "morning" | "activities" | "departures" | "daycare";

export interface DayPhase {
  id: DayPhaseId;
  label: string;
  icon: string;
  color: string;
}

function minutesSinceMidnight(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: TIME_ZONE,
  }).formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? "0");
  return hour * 60 + minute;
}

/**
 * Purely a reading of the clock against the day's known rhythm (accueil
 * 08h30-09h15, activités jusqu'à 16h, départs jusqu'à 16h15, garderie
 * ensuite) — orients the monitor without them having to think about it.
 */
export function getDayPhase(now: Date): DayPhase {
  const minutes = minutesSinceMidnight(now);

  if (minutes < 9 * 60 + 15) {
    return { id: "morning", label: "Accueil en cours", icon: "🟢", color: "var(--success)" };
  }
  if (minutes < 16 * 60) {
    return { id: "activities", label: "Activités en cours", icon: "🔵", color: "var(--brand-blue)" };
  }
  if (minutes < 16 * 60 + 15) {
    return { id: "departures", label: "Départs", icon: "🟠", color: "var(--brand-gold)" };
  }
  return { id: "daycare", label: "Garderie", icon: "🏠", color: "var(--brand-blue)" };
}
