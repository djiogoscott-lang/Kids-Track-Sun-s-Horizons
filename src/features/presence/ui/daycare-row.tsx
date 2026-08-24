"use client";

import { useState, useTransition } from "react";
import { markGoneFromDaycareAction } from "@/features/presence/ui/actions";
import type { DaycareRow } from "@/features/presence/application/queries";

const REASON_LABEL: Record<DaycareRow["reason"], string> = {
  PLANNED: "Garderie prévue",
  AFTER_SESSION: "Garderie après séance",
};

export function DaycareRowItem({ child }: { child: DaycareRow }) {
  const [gone, setGone] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (gone) return null;

  return (
    <li className="border-b border-[var(--border)] px-4 py-5 last:border-b-0 sm:px-6">
      <div className="flex items-center gap-3">
        <span
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold"
          style={{ backgroundColor: "var(--tint-blue-bg)", color: "var(--brand-blue)" }}
        >
          {child.firstName.charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-[var(--foreground)]">
            {child.firstName} {child.lastName}
          </p>
          <p className="text-xs text-[var(--muted)]">
            {child.activityName} · {REASON_LABEL[child.reason]}
          </p>
        </div>
      </div>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await markGoneFromDaycareAction(child.activityId, child.childId);
            if (result.ok) setGone(true);
            else setError(result.message ?? "Une erreur est survenue.");
          });
        }}
        className="tap-scale mt-3 h-16 w-full rounded-2xl bg-[var(--success)] text-base font-bold text-white shadow-[0_6px_16px_-6px_rgba(0,138,79,0.55)] transition hover:opacity-90 disabled:opacity-50"
      >
        🟢 Parti
      </button>
      {error ? <p role="alert" className="mt-2 text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </li>
  );
}
