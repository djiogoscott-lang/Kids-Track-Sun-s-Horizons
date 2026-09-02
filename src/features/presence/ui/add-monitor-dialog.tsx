"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createAccountAction } from "@/features/presence/ui/actions";
import type { ActivityRecord } from "@/server/data-source";

export function AddMonitorDialog({ activities }: { activities: ActivityRecord[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<"MONITOR" | "ADMIN">("MONITOR");
  const [activityId, setActivityId] = useState<string>("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  function open() {
    setFirstName("");
    setLastName("");
    setEmail("");
    setPassword("");
    setShowPassword(false);
    setRole("MONITOR");
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
      const result = await createAccountAction(email, password, firstName, lastName, role, role === "MONITOR" ? activityId || null : null);
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
        + Ajouter un compte
      </button>
      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ajouter un compte</h2>

          {done ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-4xl">✅</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">
                Compte créé et immédiatement fonctionnel pour {email}. Communiquez-lui l&apos;email et le mot de passe choisis.
              </p>
              <button type="button" onClick={close} className="tap-scale h-12 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          ) : (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setRole("MONITOR")}
                  className={`h-10 rounded-xl text-sm font-bold transition ${role === "MONITOR" ? "bg-[var(--foreground)] text-white" : "border border-[var(--border)] bg-white text-[var(--foreground)]"}`}
                >
                  Moniteur
                </button>
                <button
                  type="button"
                  onClick={() => setRole("ADMIN")}
                  className={`h-10 rounded-xl text-sm font-bold transition ${role === "ADMIN" ? "bg-[var(--foreground)] text-white" : "border border-[var(--border)] bg-white text-[var(--foreground)]"}`}
                >
                  Administrateur
                </button>
              </div>

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
                Mot de passe
                <div className="mt-1.5 flex gap-2">
                  <input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="new-password"
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="h-11 shrink-0 rounded-xl border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)]"
                  >
                    {showPassword ? "Masquer" : "Afficher"}
                  </button>
                </div>
                <span className="mt-1 block text-xs font-normal text-[var(--muted)]">8 caractères minimum. Vous choisissez ce mot de passe vous-même.</span>
              </label>
              {role === "MONITOR" ? (
                <label className="block text-sm font-semibold">
                  Activité <span className="text-[var(--danger)]">*</span>
                  <select
                    value={activityId}
                    onChange={(e) => setActivityId(e.target.value)}
                    required
                    className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5"
                  >
                    <option value="">— Choisir une activité —</option>
                    {activities.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <span className="mt-1 block text-xs font-normal text-[var(--muted)]">
                    Un moniteur gère exactement une activité. Sans elle, le compte se connecte mais ne peut rien faire.
                  </span>
                </label>
              ) : null}

              {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  // A monitor with no activity is a broken account, so the
                  // button refuses rather than letting the server reject it
                  // after the admin has typed a password.
                  disabled={isPending || (role === "MONITOR" && !activityId)}
                  onClick={submit}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Création…" : "Créer le compte"}
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
