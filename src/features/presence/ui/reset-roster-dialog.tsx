"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { resetRosterForActivityWeekAction } from "@/features/presence/ui/actions";

export function ResetRosterDialog({
  activityId,
  activityName,
  weekStart,
  participantCount,
}: {
  activityId: string;
  activityName: string;
  weekStart: string;
  participantCount: number;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  function open() {
    setError(null);
    setDone(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await resetRosterForActivityWeekAction(activityId, weekStart);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(result.removedCount);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        disabled={participantCount === 0}
        onClick={open}
        className="tap-scale h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-40"
      >
        Réinitialiser la liste
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          {done === null ? (
            <>
              <h2 className="text-lg font-bold text-[var(--foreground)]">Réinitialiser {activityName}</h2>
              <p className="mt-2 text-sm text-[var(--foreground)]">
                Vous allez retirer <strong>{participantCount}</strong> participant{participantCount > 1 ? "s" : ""} de la semaine actuelle.
              </p>
              <p className="mt-2 text-xs text-[var(--muted)]">Les profils enfants et l&apos;historique seront conservés.</p>
              {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={confirm}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--danger)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Suppression…" : "Confirmer"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </>
          ) : (
            <div className="text-center">
              <p className="text-4xl">✅</p>
              <p className="mt-2 text-sm font-semibold text-[var(--foreground)]">
                {done} participant{done > 1 ? "s" : ""} retiré{done > 1 ? "s" : ""} de la semaine. Profils et historique conservés.
              </p>
              <button type="button" onClick={close} className="tap-scale mt-4 h-12 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
