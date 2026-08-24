"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resolveAnomalyAction } from "@/features/attendance/ui/actions";

export function ResolveAnomalyButton({ anomalyId }: { anomalyId: string }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="shrink-0 text-right">
      <button
        type="button"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const result = await resolveAnomalyAction(anomalyId);
            if (!result.ok) setError(result.message);
            else router.refresh();
          })
        }
        className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] disabled:opacity-50"
      >
        Marquer comme résolue
      </button>
      {error ? <p role="alert" className="mt-1 text-xs font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
