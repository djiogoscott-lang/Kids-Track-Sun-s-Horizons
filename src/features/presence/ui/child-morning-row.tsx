"use client";

import { useState, useTransition } from "react";
import { markAbsentAction, markArrivedAction } from "@/features/presence/ui/actions";
import { cn } from "@/lib/utils";
import type { ChildMorningRow } from "@/features/presence/application/queries";

export function ChildMorningRow({
  activityId,
  child,
  locked = false,
}: {
  activityId: string;
  child: ChildMorningRow;
  locked?: boolean;
}) {
  const [status, setStatus] = useState(child.status);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function act(action: (activityId: string, childId: string) => Promise<{ ok: boolean; message?: string }>, next: typeof status) {
    setError(null);
    const previous = status;
    setStatus(next);
    startTransition(async () => {
      const result = await action(activityId, child.childId);
      if (!result.ok) {
        setStatus(previous);
        setError(result.message ?? "Une erreur est survenue.");
      }
    });
  }

  return (
    <li className="border-b border-[var(--border)] px-4 py-5 last:border-b-0 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={{
            backgroundColor: status === "ARRIVED" ? "var(--success-bg)" : status === "ABSENT" ? "var(--danger-bg)" : "var(--tint-blue-bg)",
            color: status === "ARRIVED" ? "var(--success)" : status === "ABSENT" ? "var(--danger)" : "var(--primary)",
          }}
        >
          {child.firstName.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[var(--foreground)]">
            {child.firstName} {child.lastName}
          </p>
          {status === "NOT_MARKED" ? <span className="text-xs font-semibold text-[var(--primary)]">Non traité</span> : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={isPending || locked}
          onClick={() => act(markArrivedAction, "ARRIVED")}
          aria-pressed={status === "ARRIVED"}
          className={cn(
            "tap-scale h-16 rounded-2xl text-base font-bold transition-colors",
            status === "ARRIVED"
              ? "bg-[var(--success)] text-white shadow-[0_6px_16px_-6px_rgba(0,138,79,0.55)]"
              : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🟢 Arrivé
        </button>
        <button
          type="button"
          disabled={isPending || locked}
          onClick={() => act(markAbsentAction, "ABSENT")}
          aria-pressed={status === "ABSENT"}
          className={cn(
            "tap-scale h-16 rounded-2xl text-base font-bold transition-colors",
            status === "ABSENT"
              ? "bg-[var(--danger)] text-white shadow-[0_6px_16px_-6px_rgba(225,35,54,0.55)]"
              : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🔴 Absent
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </li>
  );
}
