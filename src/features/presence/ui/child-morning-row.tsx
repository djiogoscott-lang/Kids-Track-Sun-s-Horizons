"use client";

import { useState, useTransition } from "react";
import { markAbsentAction, markArrivedAction } from "@/features/presence/ui/actions";
import { cn } from "@/lib/utils";
import type { ChildMorningRow } from "@/features/presence/application/queries";

export function ChildMorningRow({ activityId, child }: { activityId: string; child: ChildMorningRow }) {
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
    <li className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <p className="text-base font-semibold text-[var(--foreground)]">
        {child.firstName} {child.lastName}
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => act(markArrivedAction, "ARRIVED")}
          aria-pressed={status === "ARRIVED"}
          className={cn(
            "h-14 flex-1 rounded-2xl text-base font-bold transition-colors sm:flex-none sm:w-36",
            status === "ARRIVED"
              ? "bg-[var(--success)] text-white"
              : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🟢 Arrivé
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => act(markAbsentAction, "ABSENT")}
          aria-pressed={status === "ABSENT"}
          className={cn(
            "h-14 flex-1 rounded-2xl text-base font-bold transition-colors sm:flex-none sm:w-36",
            status === "ABSENT" ? "bg-[var(--danger)] text-white" : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🔴 Absent
        </button>
      </div>
      {error ? <p role="alert" className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </li>
  );
}
