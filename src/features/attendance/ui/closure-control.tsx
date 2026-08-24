"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { closeSessionAction } from "@/features/attendance/ui/actions";

type Step = "idle" | "warning" | "error";

export function ClosureControl({ sessionId, expectedTotal, departedTotal }: { sessionId: string; expectedTotal: number; departedTotal: number }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState<Step>("idle");
  const [stillPresentCount, setStillPresentCount] = useState(0);
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  function open() {
    setStep("idle");
    setMessage(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function attemptClose(force: boolean) {
    startTransition(async () => {
      const result = await closeSessionAction(sessionId, force);
      if (!result.ok) {
        setMessage(result.message);
        setStep("error");
        return;
      }
      if (!result.closed) {
        setStillPresentCount(result.stillPresentCount);
        setStep("warning");
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <Button type="button" onClick={open} className="bg-[var(--foreground)] hover:opacity-90">
        Clôturer la séance
      </Button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-md rounded-2xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40"
        onClose={() => setStep("idle")}
      >
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Clôturer la séance</h2>
          <dl className="mt-3 space-y-1 text-sm text-[var(--muted)]">
            <div className="flex justify-between">
              <dt>Attendus</dt>
              <dd className="font-semibold text-[var(--foreground)]">{expectedTotal}</dd>
            </div>
            <div className="flex justify-between">
              <dt>Départs enregistrés</dt>
              <dd className="font-semibold text-[var(--foreground)]">{departedTotal}</dd>
            </div>
          </dl>

          {step === "warning" ? (
            <p role="alert" className="mt-4 rounded-xl bg-[#fdf1de] px-4 py-3 text-sm font-medium text-[#8a5a12]">
              ⚠️ {stillPresentCount} enfant{stillPresentCount > 1 ? "s sont" : " est"} encore enregistré{stillPresentCount > 1 ? "s" : ""} comme
              présent{stillPresentCount > 1 ? "s" : ""}. Voulez-vous réellement clôturer la séance ?
            </p>
          ) : null}

          {step === "error" && message ? (
            <p role="alert" className="mt-4 rounded-xl bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {message}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={close} className="h-10 rounded-lg px-3 text-sm font-medium text-[var(--muted)]">
              Retour
            </button>
            {step === "warning" ? (
              <button
                type="button"
                disabled={isPending}
                onClick={() => attemptClose(true)}
                className="h-10 rounded-lg bg-[var(--danger)] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirmer quand même
              </button>
            ) : (
              <button
                type="button"
                disabled={isPending}
                onClick={() => attemptClose(false)}
                className="h-10 rounded-lg bg-[var(--primary)] px-4 text-sm font-semibold text-white disabled:opacity-50"
              >
                Vérifier et clôturer
              </button>
            )}
          </div>
        </div>
      </dialog>
    </>
  );
}
