"use client";

import { useState, useTransition } from "react";
import { markLeftAction, markStillPresentAction } from "@/features/presence/ui/actions";
import { cn } from "@/lib/utils";
import type { ChildEveningRow } from "@/features/presence/application/queries";

export function ChildEveningRow({
  activityId,
  child,
  locked = false,
}: {
  activityId: string;
  child: ChildEveningRow;
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

  const stillPresent = status !== "LEFT";

  return (
    <li className="border-b border-[var(--border)] px-4 py-5 last:border-b-0 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={{
            backgroundColor: status === "LEFT" ? "var(--success-bg)" : status === "DAYCARE" ? "var(--tint-blue-bg)" : "var(--warning-bg)",
            color: status === "LEFT" ? "var(--success)" : status === "DAYCARE" ? "var(--brand-blue)" : "var(--warning)",
          }}
        >
          {child.firstName.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[var(--foreground)]">
            {child.firstName} {child.lastName}
          </p>
          {status === "DAYCARE" ? (
            <span className="mt-0.5 inline-block rounded-full bg-[var(--tint-blue-bg)] px-2.5 py-0.5 text-xs font-semibold text-[var(--brand-blue)]">
              🔵 Garderie
            </span>
          ) : null}
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2.5">
        <button
          type="button"
          disabled={isPending || locked}
          onClick={() => act(markLeftAction, "LEFT")}
          aria-pressed={status === "LEFT"}
          className={cn(
            "tap-scale h-16 rounded-2xl text-base font-bold transition-colors",
            status === "LEFT"
              ? "bg-[var(--success)] text-white shadow-[0_6px_16px_-6px_rgba(0,138,79,0.55)]"
              : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🟢 Parti
        </button>
        <button
          type="button"
          disabled={isPending || locked}
          onClick={() => act(markStillPresentAction, "STILL_PRESENT")}
          aria-pressed={stillPresent}
          className={cn(
            "tap-scale h-16 rounded-2xl text-base font-bold leading-tight transition-colors",
            stillPresent
              ? "bg-[var(--warning)] text-white shadow-[0_6px_16px_-6px_rgba(246,150,2,0.55)]"
              : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🟠 Encore présent
        </button>
      </div>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </li>
  );
}
