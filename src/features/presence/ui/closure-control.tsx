"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { closeActivityDayAction } from "@/features/presence/ui/actions";
import { formatDateLong } from "@/lib/format";

export interface ClosureSummaryCounts {
  arrivedCount: number;
  absentCount: number;
  leftCount: number;
  garderieCount: number;
}

export function ClosureControl({
  activityId,
  activityName,
  counts,
  now,
}: {
  activityId: string;
  activityName: string;
  counts: ClosureSummaryCounts;
  now: Date;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const router = useRouter();

  function confirmClose() {
    startTransition(async () => {
      const result = await closeActivityDayAction(activityId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setClosed(true);
      router.refresh();
    });
  }

  function close() {
    dialogRef.current?.close();
    // Reset only after the closing animation-less dismissal, so a re-open
    // (unlikely, but harmless) doesn't flash back to the confirmation step.
    setTimeout(() => setClosed(false), 200);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setClosed(false);
          dialogRef.current?.showModal();
        }}
        className="tap-scale h-14 w-full rounded-2xl bg-[var(--foreground)] px-6 text-base font-bold text-white transition hover:opacity-90 sm:w-auto"
      >
        ✓ Clôturer la séance
      </button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40"
      >
        {!closed ? (
          <div className="p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Résumé de la séance</p>
            <h2 className="mt-1 text-xl font-bold text-[var(--foreground)]">{activityName}</h2>
            <p className="text-sm text-[var(--muted)]">{formatDateLong(now)}</p>

            <div className="mt-4 grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-[var(--success-bg)] px-4 py-3">
                <p className="text-2xl font-extrabold text-[var(--success)]">{counts.arrivedCount}</p>
                <p className="text-xs font-semibold text-[var(--success)]">🟢 Présents</p>
              </div>
              <div className="rounded-2xl bg-red-50 px-4 py-3">
                <p className="text-2xl font-extrabold text-[var(--danger)]">{counts.absentCount}</p>
                <p className="text-xs font-semibold text-[var(--danger)]">🔴 Absents</p>
              </div>
              <div className="rounded-2xl bg-[var(--tint-blue-bg)] px-4 py-3">
                <p className="text-2xl font-extrabold text-[var(--brand-blue)]">{counts.leftCount}</p>
                <p className="text-xs font-semibold text-[var(--brand-blue)]">🔵 Partis</p>
              </div>
              <div className="rounded-2xl bg-[var(--warning-bg)] px-4 py-3">
                <p className="text-2xl font-extrabold text-[var(--brand-gold)]">{counts.garderieCount}</p>
                <p className="text-xs font-semibold text-[var(--brand-gold)]">🟠 Garderie</p>
              </div>
            </div>

            <p className="mt-4 text-sm text-[var(--muted)]">
              Vérifiez la liste avant de clôturer. Les enfants encore présents seront automatiquement transférés vers la garderie.
              Cette action ne peut pas être annulée.
            </p>

            {error ? (
              <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
                {error}
              </p>
            ) : null}

            <div className="mt-5 flex flex-col gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={confirmClose}
                className="tap-scale h-14 rounded-2xl bg-[var(--foreground)] text-base font-bold text-white disabled:opacity-50"
              >
                {isPending ? "Clôture en cours…" : "Confirmer la clôture"}
              </button>
              <button
                type="button"
                onClick={close}
                disabled={isPending}
                className="tap-scale h-12 rounded-xl text-sm font-semibold text-[var(--muted)]"
              >
                Retour
              </button>
            </div>
          </div>
        ) : (
          <div className="p-6 text-center">
            <p className="text-4xl">✓</p>
            <h2 className="mt-2 text-xl font-bold text-[var(--foreground)]">Séance clôturée</h2>
            <p className="text-sm text-[var(--muted)]">
              {activityName} · {formatDateLong(now)}
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2.5 text-left">
              <p className="text-sm text-[var(--muted)]">
                🟢 Présents <span className="font-bold text-[var(--foreground)]">{counts.arrivedCount}</span>
              </p>
              <p className="text-sm text-[var(--muted)]">
                🔴 Absents <span className="font-bold text-[var(--foreground)]">{counts.absentCount}</span>
              </p>
              <p className="text-sm text-[var(--muted)]">
                🔵 Partis <span className="font-bold text-[var(--foreground)]">{counts.leftCount}</span>
              </p>
              <p className="text-sm text-[var(--muted)]">
                🟠 Garderie <span className="font-bold text-[var(--foreground)]">{counts.garderieCount}</span>
              </p>
            </div>
            <button type="button" onClick={close} className="tap-scale mt-5 h-14 w-full rounded-2xl bg-[var(--foreground)] text-base font-bold text-white">
              Voir le détail
            </button>
          </div>
        )}
      </dialog>
    </>
  );
}
