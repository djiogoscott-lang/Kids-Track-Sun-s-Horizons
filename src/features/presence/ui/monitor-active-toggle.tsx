"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setMonitorActiveAction } from "@/features/presence/ui/actions";

export function MonitorActiveToggle({ monitorId, active }: { monitorId: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await setMonitorActiveAction(monitorId, !active);
            if (!result.ok) {
              setError(result.message);
              return;
            }
            router.refresh();
          })
        }
        className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--danger)] disabled:opacity-50"
      >
        {active ? "Désactiver" : "Réactiver"}
      </button>
      {error ? <p className="text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
