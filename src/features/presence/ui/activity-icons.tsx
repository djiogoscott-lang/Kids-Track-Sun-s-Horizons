import { Bike, Music2, Trophy } from "lucide-react";
import type { LucideProps } from "lucide-react";

/** Lucide has no racket icon; this one matches its stroke style (24px, 2px round strokes). */
function TennisRacket(props: LucideProps) {
  return (
    <svg
      width={props.size ?? 24}
      height={props.size ?? 24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <ellipse cx="9.5" cy="8.5" rx="6" ry="6.5" transform="rotate(-25 9.5 8.5)" />
      <ellipse cx="9.5" cy="8.5" rx="3.4" ry="4.2" transform="rotate(-25 9.5 8.5)" opacity="0.55" />
      <path d="M13.8 12.6 20 19" />
      <path d="M18.6 17.6 21.5 20.5" />
    </svg>
  );
}

export const ACTIVITY_ICONS: Record<string, React.ComponentType<LucideProps>> = {
  "activity-danse": Music2,
  "activity-multisport": Trophy,
  "activity-velo": Bike,
  "activity-baby-tennis": TennisRacket,
};

export const ACTIVITY_COLORS: Record<string, { color: string; bg: string }> = {
  "activity-danse": { color: "var(--brand-red)", bg: "var(--danger-bg)" },
  "activity-multisport": { color: "var(--brand-blue)", bg: "var(--tint-blue-bg)" },
  "activity-velo": { color: "var(--brand-gold)", bg: "var(--warning-bg)" },
  "activity-baby-tennis": { color: "var(--brand-green)", bg: "var(--success-bg)" },
};

const DEFAULT_STYLE = { color: "var(--primary)", bg: "var(--tint-blue-bg)" };

export function activityStyle(activityId: string) {
  return ACTIVITY_COLORS[activityId] ?? DEFAULT_STYLE;
}

export function ActivityIcon({ activityId, ...props }: { activityId: string } & LucideProps) {
  const Icon = ACTIVITY_ICONS[activityId] ?? Trophy;
  return <Icon {...props} />;
}
