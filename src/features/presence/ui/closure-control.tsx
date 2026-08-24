"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { closeActivityDayAction } from "@/features/presence/ui/actions";

export function ClosureControl({ activityId }: { activityId: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function confirmClose() {
    startTransition(async () => {
      const result = await closeActivityDayAction(activityId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      dialogRef.current?.close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          dialogRef.current?.showModal();
        }}
        className="h-14 rounded-2xl bg-[var(--foreground)] px-6 text-base font-bold text-white transition hover:opacity-90"
      >
        ✓ Clôturer la séance
      </button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40"
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Clôturer cette activité ?</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Les enfants encore présents seront automatiquement transférés vers la garderie. Cette action est définitive pour la journée.
          </p>
          {error ? (
            <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
              {error}
            </p>
          ) : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialogRef.current?.close()}
              className="h-11 rounded-lg px-4 text-sm font-medium text-[var(--muted)]"
            >
              Annuler
            </button>
            <button
              type="button"
              disabled={isPending}
              onClick={confirmClose}
              className="h-11 rounded-lg bg-[var(--foreground)] px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              Clôturer la séance
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
