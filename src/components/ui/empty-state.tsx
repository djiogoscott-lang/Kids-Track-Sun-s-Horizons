import type { ReactNode } from "react";

export function EmptyState({ icon, title, description }: { icon?: ReactNode; title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--border)] bg-white/60 px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-3xl" aria-hidden="true">{icon}</div> : null}
      <p className="text-sm font-semibold text-[var(--foreground)]">{title}</p>
      {description ? <p className="mt-1 max-w-sm text-sm text-[var(--muted)]">{description}</p> : null}
    </div>
  );
}
