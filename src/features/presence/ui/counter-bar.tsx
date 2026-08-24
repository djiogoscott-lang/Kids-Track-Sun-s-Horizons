import { cn } from "@/lib/utils";

export function CounterBar({
  items,
}: {
  items: { value: number; label: string; tone?: "default" | "success" | "danger" | "warning" | "primary" }[];
}) {
  const toneClass: Record<string, string> = {
    default: "text-[var(--foreground)]",
    success: "text-[var(--success)]",
    danger: "text-[var(--danger)]",
    warning: "text-[#8a5a12]",
    primary: "text-[var(--primary)]",
  };

  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:gap-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 text-center shadow-[0_1px_2px_rgba(16,33,62,0.03)] sm:flex-1"
        >
          <p className={cn("font-heading text-2xl font-bold tabular-nums", toneClass[item.tone ?? "default"])}>{item.value}</p>
          <p className="mt-0.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted)]">{item.label}</p>
        </div>
      ))}
    </div>
  );
}
