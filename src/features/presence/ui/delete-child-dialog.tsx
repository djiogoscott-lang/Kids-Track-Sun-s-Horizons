"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteChildPermanentlyAction } from "@/features/presence/ui/actions";

export function DeleteChildDialog({ childId, childName }: { childId: string; childName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setConfirmText("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await deleteChildPermanentlyAction(childId, confirmText);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.push("/admin/children");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-11 rounded-xl border border-[var(--danger)] bg-white px-4 text-sm font-semibold text-[var(--danger)] transition hover:bg-red-50"
      >
        🗑️ Supprimer définitivement
      </button>
      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--danger)]">Suppression définitive</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">
            Cette action supprimera définitivement <strong>{childName}</strong>. Elle est impossible à annuler.
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Si cet enfant a déjà une présence enregistrée, la suppression sera refusée automatiquement pour protéger l&apos;historique — utilisez Désactiver dans ce cas.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Tapez SUPPRIMER pour confirmer
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--danger)]"
              autoComplete="off"
            />
          </label>
          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending || confirmText.trim().toUpperCase() !== "SUPPRIMER"}
              onClick={submit}
              className="tap-scale h-12 flex-1 rounded-xl bg-[var(--danger)] text-sm font-bold text-white disabled:opacity-40"
            >
              {isPending ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
              Annuler
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
