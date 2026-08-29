"use client";

import { useRef, useState, useTransition } from "react";
import { updateMonitorPasswordAction } from "@/features/presence/ui/actions";

export function MonitorPasswordDialog({ monitorId }: { monitorId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function open() {
    setNewPassword("");
    setConfirmPassword("");
    setError(null);
    setDone(false);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateMonitorPasswordAction(monitorId, newPassword, confirmPassword);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
    });
  }

  return (
    <>
      <button type="button" onClick={open} className="text-xs font-semibold text-[var(--primary)] hover:underline">
        Changer le mot de passe
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Changer le mot de passe</h2>

          {done ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-3xl">✅</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">Mot de passe modifié avec succès.</p>
              <button type="button" onClick={close} className="tap-scale h-11 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-3">
              <label className="block text-sm font-semibold">
                Nouveau mot de passe
                <input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
                />
              </label>
              <label className="block text-sm font-semibold">
                Confirmer le nouveau mot de passe
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
                />
              </label>
              <p className="text-xs text-[var(--muted)]">8 caractères minimum.</p>
              {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
              <div className="flex gap-2 pt-1">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={submit}
                  className="tap-scale h-11 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Enregistrement…" : "Enregistrer"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-11 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}
