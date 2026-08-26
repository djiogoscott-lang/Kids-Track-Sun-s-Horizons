"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMonitorActiveAction } from "@/features/presence/ui/actions";

export function MonitorActiveToggle({ monitorId, monitorName, active }: { monitorId: string; monitorName: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();

  function apply() {
    startTransition(async () => {
      setError(null);
      const result = await setMonitorActiveAction(monitorId, !active);
      setConfirming(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  if (confirming) {
    return (
      <div className="flex flex-col items-end gap-1.5 rounded-xl border border-[var(--border)] bg-white p-2.5">
        <p className="text-xs font-medium text-[var(--foreground)]">
          {active ? `Désactiver ${monitorName} ?` : `Réactiver ${monitorName} ?`}
        </p>
        <div className="flex gap-1.5">
          <button
            type="button"
            disabled={isPending}
            onClick={apply}
            className="h-8 rounded-lg bg-[var(--foreground)] px-3 text-xs font-bold text-white disabled:opacity-50"
          >
            Confirmer
          </button>
          <button type="button" onClick={() => setConfirming(false)} className="h-8 rounded-lg px-3 text-xs font-semibold text-[var(--muted)]">
            Annuler
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() => setConfirming(true)}
        className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--danger)] disabled:opacity-50"
      >
        {active ? "🔴 Désactiver" : "🟢 Réactiver"}
      </button>
      {error ? <p className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
