import { cn } from "@/lib/utils";
import type { ArrivalClassification, PresenceState } from "@/features/attendance/domain/types";

interface BadgeSpec {
  label: string;
  dot: string;
  text: string;
  bg: string;
}

function specFor(presenceState: PresenceState, arrivalClassification: ArrivalClassification): BadgeSpec {
  if (presenceState === "PRESENT" && arrivalClassification === "LATE") {
    return { label: "En retard", dot: "bg-[var(--warning)]", text: "text-[#8a5a12]", bg: "bg-[#fdf1de]" };
  }
  switch (presenceState) {
    case "PRESENT":
      return { label: "Présent", dot: "bg-[var(--success)]", text: "text-[#0d6b47]", bg: "bg-[#e4f8ef]" };
    case "ABSENT":
      return { label: "Absent", dot: "bg-[var(--danger)]", text: "text-[#9c2c39]", bg: "bg-[#fdeced]" };
    case "EXCUSED":
      return { label: "Excusé", dot: "bg-[var(--muted)]", text: "text-[#3d4b61]", bg: "bg-[#eef1f6]" };
    case "LEFT":
      return { label: "Parti", dot: "bg-[var(--primary)]", text: "text-[#0d4faa]", bg: "bg-[#e7f0ff]" };
    case "EXPECTED":
    default:
      return { label: "À traiter", dot: "bg-slate-300", text: "text-slate-600", bg: "bg-slate-100" };
  }
}

export function PresenceBadge({
  presenceState,
  arrivalClassification,
  className,
}: {
  presenceState: PresenceState;
  arrivalClassification: ArrivalClassification;
  className?: string;
}) {
  const spec = specFor(presenceState, arrivalClassification);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
        spec.bg,
        spec.text,
        className,
      )}
    >
      <span aria-hidden="true" className={cn("h-2 w-2 rounded-full", spec.dot)} />
      {spec.label}
    </span>
  );
}
