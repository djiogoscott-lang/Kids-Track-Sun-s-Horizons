import { cn } from "@/lib/utils";

export function CounterBar({
  title,
  items,
}: {
  title?: string;
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
    <div className="rounded-3xl border border-[var(--border)] bg-white p-4 shadow-[0_1px_2px_rgba(16,33,62,0.03)] sm:p-5">
      {title ? <p className="mb-3 text-xs font-bold uppercase tracking-[0.12em] text-[var(--muted)]">{title}</p> : null}
      <div className="grid grid-cols-2 gap-3 sm:flex">
        {items.map((item) => (
          <div key={item.label} className="text-center sm:flex-1">
            <p className={cn("font-heading text-4xl font-extrabold leading-none tabular-nums sm:text-5xl", toneClass[item.tone ?? "default"])}>
              {item.value}
            </p>
            <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.06em] text-[var(--muted)] sm:text-sm">{item.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
