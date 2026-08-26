"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface RowOutcome {
  row: number;
  status: "valid" | "duplicate" | "error";
  message?: string;
  data?: { firstName: string; lastName: string; activityId: string; activityName: string; daycareAuto: boolean; active: boolean; notes: string };
}

interface PreviewResponse {
  summary: { total: number; valid: number; duplicates: number; errors: number };
  results: RowOutcome[];
}

type Step = "pick" | "preview" | "done";

export function ExcelImportDialog() {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [step, setStep] = useState<Step>("pick");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function reset() {
    setStep("pick");
    setError(null);
    setPreview(null);
    setIncludeDuplicates(false);
    setResult(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function open() {
    reset();
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function analyze() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choisissez un fichier .xlsx.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/admin/children/import/preview", { method: "POST", body: formData });
      const json = (await res.json()) as PreviewResponse & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de l'analyse du fichier.");
        return;
      }
      setPreview(json);
      setStep("preview");
    });
  }

  function confirmImport() {
    if (!preview) return;
    const rows = preview.results
      .filter((r) => r.status === "valid" || (r.status === "duplicate" && includeDuplicates))
      .map((r) => r.data)
      .filter((d): d is NonNullable<typeof d> => Boolean(d));

    if (rows.length === 0) {
      setError("Aucune ligne à importer.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/children/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows }),
      });
      const json = (await res.json()) as { ok?: boolean; count?: number; error?: string };
      if (!res.ok || !json.ok) {
        setResult({ ok: false, message: json.error ?? "Import annulé : aucune modification effectuée." });
      } else {
        setResult({ ok: true, message: `${json.count} enfant${(json.count ?? 0) > 1 ? "s" : ""} importé${(json.count ?? 0) > 1 ? "s" : ""}.` });
        router.refresh();
      }
      setStep("done");
    });
  }

  const errorRows = preview?.results.filter((r) => r.status === "error") ?? [];
  const duplicateRows = preview?.results.filter((r) => r.status === "duplicate") ?? [];

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-11 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]"
      >
        📥 Importer Excel
      </button>
      <dialog
        ref={dialogRef}
        className="w-full max-w-lg rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40"
      >
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Import Excel</h2>

          {step === "pick" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Choisissez un fichier .xlsx suivant le modèle officiel. Vous verrez un aperçu avant toute modification.
              </p>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="block w-full text-sm"
                aria-label="Choisir un fichier Excel"
              />
              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={analyze}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Analyse en cours…" : "Analyser le fichier"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          {step === "preview" && preview ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">{preview.summary.total} ligne{preview.summary.total > 1 ? "s" : ""} détectée{preview.summary.total > 1 ? "s" : ""}</p>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-[var(--success)]">✅ {preview.summary.valid} valide{preview.summary.valid > 1 ? "s" : ""}</span>
                <span className="text-[var(--brand-gold)]">⚠️ {preview.summary.duplicates} doublon{preview.summary.duplicates > 1 ? "s" : ""}</span>
                <span className="text-[var(--danger)]">❌ {preview.summary.errors} invalide{preview.summary.errors > 1 ? "s" : ""}</span>
              </div>

              {errorRows.length > 0 ? (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--danger)]">Erreurs (non importées)</p>
                  <ul className="space-y-1 text-sm text-red-800">
                    {errorRows.map((r) => (
                      <li key={r.row}>❌ Ligne {r.row} : {r.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {duplicateRows.length > 0 ? (
                <div className="rounded-xl bg-[var(--warning-bg)] p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--brand-gold)]">Doublons potentiels</p>
                  <ul className="space-y-1 text-sm text-[var(--foreground)]">
                    {duplicateRows.map((r) => (
                      <li key={r.row}>⚠️ Ligne {r.row} : {r.message}</li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={includeDuplicates} onChange={(e) => setIncludeDuplicates(e.target.checked)} />
                    Importer quand même les doublons
                  </label>
                </div>
              ) : null}

              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending || preview.summary.valid + (includeDuplicates ? preview.summary.duplicates : 0) === 0}
                  onClick={confirmImport}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Import en cours…" : "Confirmer l'import"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          {step === "done" && result ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-4xl">{result.ok ? "✅" : "❌"}</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{result.message}</p>
              <button type="button" onClick={close} className="tap-scale h-12 w-full rounded-xl bg-[var(--foreground)] text-sm font-bold text-white">
                Fermer
              </button>
            </div>
          ) : null}
        </div>
      </dialog>
    </>
  );
}
