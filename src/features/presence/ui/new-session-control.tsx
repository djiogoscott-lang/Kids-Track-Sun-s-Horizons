"use client";

import { useRef, useState, useTransition } from "react";
import { checkNewSessionAction } from "@/features/presence/ui/actions";
import { formatDateLong } from "@/lib/format";

/**
 * Admin-only. There is no "reset" here — a new calendar date already starts
 * every activity at 0 présent / 0 absent / tous non traité automatically
 * (no attendance row exists yet for that date), and nothing here writes to
 * the database. This button exists to make that explicit and to refuse to
 * confirm a fresh session when today already has real activity, per the
 * "une séance existe déjà pour aujourd'hui" rule.
 */
export function NewSessionControl({ activityId, activityName, now }: { activityId: string; activityName: string; now: Date }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<
    { alreadyExists: true } | { alreadyExists: false; total: number; notMarkedCount: number } | { error: string } | null
  >(null);

  function open() {
    setResult(null);
    dialogRef.current?.showModal();
    startTransition(async () => {
      const res = await checkNewSessionAction(activityId);
      if (!res.ok) {
        setResult({ error: res.message });
      } else if (res.alreadyExists) {
        setResult({ alreadyExists: true });
      } else {
        setResult({ alreadyExists: false, total: res.total, notMarkedCount: res.notMarkedCount });
      }
    });
  }

  function close() {
    dialogRef.current?.close();
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-14 w-full rounded-2xl border-2 border-[var(--primary)] px-6 text-base font-bold text-[var(--primary)] transition hover:bg-[var(--tint-blue-bg)] sm:w-auto"
      >
        🆕 Nouvelle séance
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">{activityName}</p>
          <p className="text-sm text-[var(--muted)]">{formatDateLong(now)}</p>

          {isPending || !result ? (
            <p className="mt-4 text-sm text-[var(--muted)]">Vérification…</p>
          ) : "error" in result ? (
            <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{result.error}</p>
          ) : result.alreadyExists ? (
            <p className="mt-4 rounded-xl bg-[var(--warning-bg)] px-3.5 py-2.5 text-sm font-semibold text-[#8a5a12]">
              ⚠️ Une séance existe déjà pour aujourd&apos;hui.
            </p>
          ) : (
            <div className="mt-4 space-y-3">
              <p className="text-sm font-semibold text-[var(--success)]">✅ Nouvelle séance prête.</p>
              <div className="grid grid-cols-2 gap-2.5 text-sm">
                <p className="text-[var(--muted)]">
                  Enfants <span className="font-bold text-[var(--foreground)]">{result.total}</span>
                </p>
                <p className="text-[var(--muted)]">
                  Arrivés <span className="font-bold text-[var(--foreground)]">0</span>
                </p>
                <p className="text-[var(--muted)]">
                  Absents <span className="font-bold text-[var(--foreground)]">0</span>
                </p>
                <p className="text-[var(--muted)]">
                  À traiter <span className="font-bold text-[var(--foreground)]">{result.notMarkedCount}</span>
                </p>
                <p className="text-[var(--muted)]">
                  Partis <span className="font-bold text-[var(--foreground)]">0</span>
                </p>
                <p className="text-[var(--muted)]">
                  Garderie <span className="font-bold text-[var(--foreground)]">0</span>
                </p>
              </div>
              <p className="text-sm font-semibold text-[var(--primary)]">⚪ Statut : Appel non commencé</p>
            </div>
          )}

          <button type="button" onClick={close} className="tap-scale mt-5 h-12 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
            Fermer
          </button>
        </div>
      </dialog>
    </>
  );
}
