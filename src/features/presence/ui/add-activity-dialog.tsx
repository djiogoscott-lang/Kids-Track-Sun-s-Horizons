"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createActivityAction } from "@/features/presence/ui/actions";
import type { MonitorRecord } from "@/server/data-source";

export function AddActivityDialog({ monitors }: { monitors: MonitorRecord[] }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monitorId, setMonitorId] = useState("");
  const [active, setActive] = useState(true);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setName("");
    setDescription("");
    setMonitorId("");
    setActive(true);
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await createActivityAction({ name, description, monitorId: monitorId || null, active });
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
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
        + Ajouter une activité
      </button>
      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ajouter une activité</h2>
          <div className="mt-4 space-y-4">
            <label className="block text-sm font-semibold">
              Nom de l&apos;activité
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm font-semibold">
              Description (facultatif)
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                className="mt-1.5 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 py-2.5 outline-none focus:border-[var(--primary)]"
              />
            </label>
            <label className="block text-sm font-semibold">
              Moniteur responsable
              <select
                value={monitorId}
                onChange={(e) => setMonitorId(e.target.value)}
                className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5"
              >
                <option value="">Aucun pour l&apos;instant</option>
                {monitors.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm font-semibold">
              Statut
              <select
                value={active ? "active" : "inactive"}
                onChange={(e) => setActive(e.target.value === "active")}
                className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5"
              >
                <option value="active">Actif</option>
                <option value="inactive">Inactif</option>
              </select>
            </label>

            {error ? <p role="alert" className="rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}

            <div className="flex gap-2">
              <button
                type="button"
                disabled={isPending}
                onClick={submit}
                className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
              >
                {isPending ? "Création…" : "Créer"}
              </button>
              <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                Annuler
              </button>
            </div>
          </div>
        </div>
      </dialog>
    </>
  );
}
