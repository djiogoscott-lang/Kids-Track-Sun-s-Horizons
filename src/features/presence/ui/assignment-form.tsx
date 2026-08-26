"use client";

import { useState, useTransition } from "react";
import { assignMonitorAction } from "@/features/presence/ui/actions";
import type { AssignmentRow } from "@/features/presence/application/queries";
import type { MonitorRecord as Monitor } from "@/server/data-source";

export function AssignmentForm({ assignment, monitors }: { assignment: AssignmentRow; monitors: Monitor[] }) {
  const [monitorId, setMonitorId] = useState(assignment.monitorId);
  const [pendingMonitorId, setPendingMonitorId] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function requestChange(nextMonitorId: string) {
    setError(null);
    setSaved(false);
    if (nextMonitorId === monitorId) return;
    setPendingMonitorId(nextMonitorId);
  }

  function confirmChange() {
    if (!pendingMonitorId) return;
    const nextMonitorId = pendingMonitorId;
    startTransition(async () => {
      const result = await assignMonitorAction(assignment.activityId, nextMonitorId);
      setPendingMonitorId(null);
      if (result.ok) {
        setMonitorId(nextMonitorId);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } else {
        setError(result.message ?? "Une erreur est survenue.");
      }
    });
  }

  const pendingMonitorName = monitors.find((m) => m.id === pendingMonitorId)?.name;

  return (
    <div className="border-b border-[var(--border)] px-5 py-4 last:border-b-0">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold text-[var(--foreground)]">{assignment.activityName}</p>
        <div className="flex items-center gap-2">
          {saved ? <span className="text-xs font-semibold text-[var(--success)]">✓ Enregistré</span> : null}
          {error ? <span className="text-xs font-semibold text-[var(--danger)]">{error}</span> : null}
          <select
            value={pendingMonitorId ?? monitorId}
            disabled={isPending || Boolean(pendingMonitorId)}
            onChange={(event) => requestChange(event.target.value)}
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
      {pendingMonitorId ? (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--warning-bg)] px-3.5 py-2.5">
          <p className="text-xs font-medium text-[var(--foreground)]">
            Réassigner {assignment.activityName} à {pendingMonitorName} ?
          </p>
          <div className="flex gap-1.5">
            <button
              type="button"
              disabled={isPending}
              onClick={confirmChange}
              className="h-8 rounded-lg bg-[var(--foreground)] px-3 text-xs font-bold text-white disabled:opacity-50"
            >
              Confirmer
            </button>
            <button type="button" onClick={() => setPendingMonitorId(null)} className="h-8 rounded-lg px-3 text-xs font-semibold text-[var(--muted)]">
              Annuler
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
