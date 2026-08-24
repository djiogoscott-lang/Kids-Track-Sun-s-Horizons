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
    <li className="flex flex-col gap-2 border-b border-[var(--border)] px-4 py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div>
        <p className="text-base font-semibold text-[var(--foreground)]">
          🧒 {child.firstName} {child.lastName}
        </p>
        <p className="text-xs text-[var(--muted)]">
          {child.activityName} · {REASON_LABEL[child.reason]}
        </p>
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
        className="h-12 rounded-2xl bg-[var(--success)] px-5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
      >
        🟢 Parti
      </button>
      {error ? <p role="alert" className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </li>
  );
}
