"use client";

import { useState, useTransition } from "react";
import { assignMonitorAction } from "@/features/presence/ui/actions";
import type { AssignmentRow } from "@/features/presence/application/queries";
import type { MonitorRecord as Monitor } from "@/server/data-source";

export function AssignmentForm({ assignment, monitors }: { assignment: AssignmentRow; monitors: Monitor[] }) {
  const [monitorId, setMonitorId] = useState(assignment.monitorId);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onChange(nextMonitorId: string) {
    setMonitorId(nextMonitorId);
    setSaved(false);
    setError(null);
    startTransition(async () => {
      const result = await assignMonitorAction(assignment.activityId, nextMonitorId);
      if (result.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.message ?? "Une erreur est survenue.");
      }
    });
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <p className="font-semibold text-[var(--foreground)]">{assignment.activityName}</p>
      <div className="flex items-center gap-2">
        {saved ? <span className="text-xs font-semibold text-[var(--success)]">✓ Enregistré</span> : null}
        {error ? <span className="text-xs font-semibold text-[var(--danger)]">{error}</span> : null}
        <select
          value={monitorId}
          disabled={isPending}
          onChange={(event) => onChange(event.target.value)}
          className="h-10 rounded-lg border border-[var(--border)] bg-white px-3 text-sm font-medium"
        >
          {monitors.map((monitor) => (
            <option key={monitor.id} value={monitor.id}>
              {monitor.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}
