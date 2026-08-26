"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMonitorNameAction } from "@/features/presence/ui/actions";

export function MonitorNameEdit({ monitorId, currentName }: { monitorId: string; currentName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [name, setName] = useState(currentName);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setName(currentName);
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateMonitorNameAction(monitorId, name);
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
      <button type="button" onClick={open} className="text-xs font-semibold text-[var(--primary)] hover:underline">
        Modifier
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Modifier le nom</h2>
          <label className="mt-4 block text-sm font-semibold">
            Nom complet
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
            />
          </label>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending}
              onClick={submit}
              className="tap-scale h-11 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
            >
              Enregistrer
            </button>
            <button type="button" onClick={close} className="tap-scale h-11 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
              Annuler
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
