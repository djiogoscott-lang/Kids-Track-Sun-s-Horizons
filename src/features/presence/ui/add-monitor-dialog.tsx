"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { inviteMonitorAction } from "@/features/presence/ui/actions";
import type { ActivityRecord } from "@/server/data-source";

export function AddMonitorDialog({ activities }: { activities: ActivityRecord[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [activityId, setActivityId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function open() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setActivityId("");
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
      const result = await inviteMonitorAction(email, firstName, lastName, activityId || null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setDone(true);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--primary-strong)]"
      >
        + Ajouter un moniteur
      </button>
      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ajouter un moniteur</h2>

          {done ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-4xl">✅</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Invitation envoyée à {email}. Le moniteur définira son mot de passe en cliquant sur le lien reçu par email.
              </p>
              <button type="button" onClick={close} className="tap-scale h-12 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm font-semibold">
                  Prénom
                  <input
                    value={firstName}
                    onChange={(e) => setFirstName(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
                  />
                </label>
                <label className="block text-sm font-semibold">
                  Nom
                  <input
                    value={lastName}
                    onChange={(e) => setLastName(e.target.value)}
                    className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
                  />
                </label>
              </div>
              <label className="block text-sm font-semibold">
                Email
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
                />
              </label>
              <label className="block text-sm font-semibold">
                Activité (facultatif)
                <select
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                  className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5"
                >
                  <option value="">Aucune pour l&apos;instant</option>
                  {activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <p className="text-xs text-[var(--muted)]">
                Rôle : Moniteur. Un email d&apos;invitation lui permettra de définir son propre mot de passe — aucun mot de passe n&apos;est créé ici.
              </p>

              {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={submit}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Envoi…" : "Envoyer l'invitation"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
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
