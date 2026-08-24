import { cn } from "@/lib/utils";

export function CounterStat({
  value,
  label,
  tone = "default",
}: {
  value: number;
  label: string;
  tone?: "default" | "success" | "danger" | "warning" | "primary";
}) {
  const toneClass = {
    default: "text-[var(--foreground)]",
    success: "text-[var(--success)]",
    danger: "text-[var(--danger)]",
    warning: "text-[#8a5a12]",
    primary: "text-[var(--primary)]",
  }[tone];

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3 text-center sm:px-5 sm:py-4">
      <p className={cn("text-2xl font-bold tabular-nums sm:text-3xl", toneClass)}>{value}</p>
      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{label}</p>
    </div>
  );
}
