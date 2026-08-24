import { getDayPhase } from "@/features/presence/domain/day-phase";
import { formatTime } from "@/lib/format";

export function DayStatusBar({ now }: { now: Date }) {
  const phase = getDayPhase(now);

  return (
    <div className="flex items-center gap-2 text-sm">
      <span className="font-heading font-bold text-[var(--foreground)]">{formatTime(now)}</span>
      <span aria-hidden="true">{phase.icon}</span>
      <span className="font-semibold" style={{ color: phase.color }}>
        {phase.label}
      </span>
    </div>
  );
}
