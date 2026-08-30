"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { duplicatePreviousWeekAction } from "@/features/presence/ui/actions";

/**
 * Never automatic — this is the only way last week's roster carries
 * forward, and only when an admin explicitly asks for it. Skips any child
 * who already has a row for the target week, so it never overwrites an
 * edit already made to the current week.
 */
export function DuplicateWeekButton({ fromWeekStart, toWeekStart }: { fromWeekStart: string; toWeekStart: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  return (
    <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          setMessage(null);
          startTransition(async () => {
            const result = await duplicatePreviousWeekAction(fromWeekStart, toWeekStart);
            if (!result.ok) {
              setMessage({ ok: false, text: result.message });
              return;
            }
            setMessage({ ok: true, text: `${result.addedCount} participant${result.addedCount > 1 ? "s" : ""} copié${result.addedCount > 1 ? "s" : ""} depuis la semaine précédente.` });
            router.refresh();
          });
        }}
        className="tap-scale h-11 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-50"
      >
        {isPending ? "Copie…" : "↩️ Dupliquer la semaine précédente"}
      </button>
      {message ? (
        <span className={`text-xs font-semibold ${message.ok ? "text-[var(--success)]" : "text-[var(--danger)]"}`}>{message.text}</span>
      ) : null}
    </div>
  );
}
