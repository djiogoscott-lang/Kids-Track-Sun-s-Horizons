"use client";

import { useState, useTransition } from "react";
import { markLeftAction, markStillPresentAction } from "@/features/presence/ui/actions";
import { cn } from "@/lib/utils";
import type { ChildEveningRow } from "@/features/presence/application/queries";

export function ChildEveningRow({ activityId, child }: { activityId: string; child: ChildEveningRow }) {
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

  const stillPresent = status !== "LEFT";

  return (
    <li className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex items-center gap-2">
        <p className="text-base font-semibold text-[var(--foreground)]">
          {child.firstName} {child.lastName}
        </p>
        {status === "DAYCARE" ? (
          <span className="rounded-full bg-[#e7f0ff] px-2.5 py-1 text-xs font-semibold text-[#0d4faa]">🔵 Garderie</span>
        ) : null}
      </div>
      <div className="flex gap-2">
        <button
          type="button"
          disabled={isPending}
          onClick={() => act(markLeftAction, "LEFT")}
          aria-pressed={status === "LEFT"}
          className={cn(
            "h-14 flex-1 rounded-2xl text-base font-bold transition-colors sm:flex-none sm:w-36",
            status === "LEFT" ? "bg-[var(--success)] text-white" : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🟢 Parti
        </button>
        <button
          type="button"
          disabled={isPending}
          onClick={() => act(markStillPresentAction, "STILL_PRESENT")}
          aria-pressed={stillPresent}
          className={cn(
            "h-14 flex-1 rounded-2xl text-base font-bold transition-colors sm:flex-none sm:w-40",
            stillPresent ? "bg-[var(--warning)] text-white" : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🟠 Encore présent
        </button>
      </div>
      {error ? <p role="alert" className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </li>
  );
}
