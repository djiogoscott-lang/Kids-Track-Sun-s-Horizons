"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getOperationalResetPreviewAction, resetOperationalDataAction } from "@/features/presence/ui/actions";

type Counts = { attendance: number; activityDayState: number; weeklyRoster: number; notifications: number };
type Step = "closed" | "loading" | "confirm" | "done";

export function ResetOperationalDataSection() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [step, setStep] = useState<Step>("closed");
  const [counts, setCounts] = useState<Counts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function open() {
    setError(null);
    setStep("loading");
    dialogRef.current?.showModal();
    startTransition(async () => {
      const result = await getOperationalResetPreviewAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCounts({ attendance: result.attendance, activityDayState: result.activityDayState, weeklyRoster: result.weeklyRoster, notifications: result.notifications });
      setStep("confirm");
    });
  }

  function close() {
    dialogRef.current?.close();
    setStep("closed");
  }

  function confirm() {
    setError(null);
    startTransition(async () => {
      const result = await resetOperationalDataAction();
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setCounts({ attendance: result.attendance, activityDayState: result.activityDayState, weeklyRoster: result.weeklyRoster, notifications: result.notifications });
      setStep("done");
      router.refresh();
    });
  }

  const total = counts ? counts.attendance + counts.activityDayState + counts.weeklyRoster + counts.notifications : 0;

  return (
    <div className="rounded-2xl border border-[var(--danger)]/30 bg-red-50/40 p-5">
      <h2 className="text-lg font-bold text-[var(--danger)]">Zone sensible</h2>
      <p className="mt-1 text-sm text-[var(--foreground)]">
        Réinitialiser les données opérationnelles (présences, départs, garderie, clôtures, participants de la semaine, historique, notifications) pour repartir sur une base propre.
      </p>
      <button
        type="button"
        onClick={open}
        className="tap-scale mt-3 h-11 rounded-xl border border-[var(--danger)] bg-white px-4 text-sm font-bold text-[var(--danger)] transition hover:bg-red-50"
      >
        Réinitialiser les données opérationnelles
      </button>

      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--danger)]">Réinitialisation des données opérationnelles</h2>

          {step === "loading" ? <p className="mt-4 text-sm text-[var(--muted)]">Calcul du nombre d&apos;éléments concernés…</p> : null}

          {step === "confirm" && counts ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Vous allez supprimer :</p>
              <ul className="space-y-1 rounded-xl bg-white p-3 text-sm text-[var(--foreground)]">
                <li>Présences (arrivées/absences) : <strong>{counts.attendance}</strong></li>
                <li>Clôtures de séance : <strong>{counts.activityDayState}</strong></li>
                <li>Participants de la semaine (roster) : <strong>{counts.weeklyRoster}</strong></li>
                <li>Notifications : <strong>{counts.notifications}</strong></li>
              </ul>
              <p className="rounded-xl bg-[var(--tint-blue-bg)] p-3 text-sm text-[var(--foreground)]">
                Les comptes administrateurs, moniteurs, les profils enfants et les activités ne seront <strong>pas</strong> supprimés.
              </p>
              {total === 0 ? (
                <p className="text-sm text-[var(--muted)]">Aucune donnée opérationnelle à supprimer — la base est déjà propre.</p>
              ) : null}
              {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={confirm}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--danger)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Réinitialisation…" : "Confirmer la réinitialisation"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          {step === "confirm" && !counts && error ? (
            <div className="mt-4 space-y-4">
              <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p>
              <button type="button" onClick={close} className="tap-scale h-11 w-full rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                Fermer
              </button>
            </div>
          ) : null}

          {step === "done" && counts ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-4xl">✅</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">Réinitialisation terminée.</p>
              <ul className="space-y-1 rounded-xl bg-[var(--success-bg)] p-3 text-left text-sm text-[var(--foreground)]">
                <li>Présences supprimées : {counts.attendance}</li>
                <li>Clôtures supprimées : {counts.activityDayState}</li>
                <li>Participants retirés : {counts.weeklyRoster}</li>
                <li>Notifications supprimées : {counts.notifications}</li>
              </ul>
              <button type="button" onClick={close} className="tap-scale h-12 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          ) : null}
        </div>
      </dialog>
    </div>
  );
}
