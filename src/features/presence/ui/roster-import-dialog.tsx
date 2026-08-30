"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

interface RosterRowOutcome {
  row: { firstName: string; lastName: string; activityName: string; weekLabel?: string };
  status: "MATCHED" | "UNKNOWN_CHILD" | "UNKNOWN_ACTIVITY" | "WEEK_MISMATCH" | "DUPLICATE";
  message?: string;
}

interface PreviewResponse {
  summary: { total: number; matched: number; unknownChildren: number; unknownActivities: number; weekMismatches: number; duplicates: number };
  results: RosterRowOutcome[];
  sheetName: string;
}

interface MultiSheetResponse {
  multipleSheets: true;
  sheetNames: string[];
}

type Step = "pick" | "choose-sheet" | "preview" | "done";

export function RosterImportDialog({ weekStart }: { weekStart: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [step, setStep] = useState<Step>("pick");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [createUnknownChildren, setCreateUnknownChildren] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  function reset() {
    setStep("pick");
    setError(null);
    setSheetNames([]);
    setPreview(null);
    setCreateUnknownChildren(false);
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

  function analyze(sheetName?: string) {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Choisissez un fichier .xlsx.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("weekStart", weekStart);
      if (sheetName) formData.append("sheetName", sheetName);
      const res = await fetch("/api/admin/roster/import/preview", { method: "POST", body: formData });
      const json = (await res.json()) as (PreviewResponse | MultiSheetResponse) & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de l'analyse du fichier.");
        return;
      }
      if ("multipleSheets" in json) {
        setSheetNames(json.sheetNames);
        setStep("choose-sheet");
        return;
      }
      setPreview(json);
      setStep("preview");
    });
  }

  function confirmImport() {
    if (!preview) return;
    const rows = preview.results
      .filter((r) => r.status === "MATCHED" || (r.status === "UNKNOWN_CHILD" && createUnknownChildren))
      .map((r) => r.row);

    if (rows.length === 0) {
      setError("Aucune ligne à importer.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/roster/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, weekStart, createUnknownChildren }),
      });
      const json = (await res.json()) as { ok?: boolean; addedCount?: number; createdChildrenCount?: number; error?: string };
      if (!res.ok || !json.ok) {
        setResult({ ok: false, message: json.error ?? "Import annulé : aucune modification effectuée." });
      } else {
        const extra = (json.createdChildrenCount ?? 0) > 0 ? ` (dont ${json.createdChildrenCount} nouvelle${json.createdChildrenCount! > 1 ? "s" : ""} fiche${json.createdChildrenCount! > 1 ? "s" : ""} enfant créée${json.createdChildrenCount! > 1 ? "s" : ""})` : "";
        setResult({ ok: true, message: `${json.addedCount} participant${(json.addedCount ?? 0) > 1 ? "s" : ""} ajouté${(json.addedCount ?? 0) > 1 ? "s" : ""} à la semaine${extra}.` });
        router.refresh();
      }
      setStep("done");
    });
  }

  const unknownActivityRows = preview?.results.filter((r) => r.status === "UNKNOWN_ACTIVITY") ?? [];
  const weekMismatchRows = preview?.results.filter((r) => r.status === "WEEK_MISMATCH") ?? [];
  const duplicateRows = preview?.results.filter((r) => r.status === "DUPLICATE") ?? [];
  const unknownChildRows = preview?.results.filter((r) => r.status === "UNKNOWN_CHILD") ?? [];

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-11 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]"
      >
        📥 Importer Excel
      </button>
      <dialog ref={dialogRef} className="w-full max-w-lg rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Importer les participants de la semaine</h2>

          {step === "pick" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Fichier .xlsx avec les colonnes Prénom, Nom, Activité (Semaine facultative). Vous verrez un aperçu avant toute écriture.
              </p>
              <input ref={fileInputRef} type="file" accept=".xlsx" className="block w-full text-sm" aria-label="Choisir un fichier Excel" />
              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => analyze()}
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

          {step === "choose-sheet" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">Plusieurs feuilles détectées.</p>
              <div className="space-y-2">
                {sheetNames.map((name) => (
                  <button
                    key={name}
                    type="button"
                    disabled={isPending}
                    onClick={() => analyze(name)}
                    className="tap-scale block w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm font-semibold text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-50"
                  >
                    📄 {name}
                  </button>
                ))}
              </div>
              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
              <button type="button" onClick={close} className="tap-scale h-11 w-full rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                Annuler
              </button>
            </div>
          ) : null}

          {step === "preview" && preview ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {preview.summary.total} ligne{preview.summary.total > 1 ? "s" : ""} détectée{preview.summary.total > 1 ? "s" : ""}
              </p>
              <div className="flex flex-wrap gap-3 text-sm">
                <span className="text-[var(--success)]">✅ {preview.summary.matched} reconnu{preview.summary.matched > 1 ? "s" : ""}</span>
                <span className="text-[var(--brand-gold)]">❓ {preview.summary.unknownChildren} inconnu{preview.summary.unknownChildren > 1 ? "s" : ""}</span>
                <span className="text-[var(--danger)]">❌ {preview.summary.unknownActivities} activité{preview.summary.unknownActivities > 1 ? "s" : ""} invalide{preview.summary.unknownActivities > 1 ? "s" : ""}</span>
                {preview.summary.weekMismatches > 0 ? <span className="text-[var(--danger)]">📅 {preview.summary.weekMismatches} semaine différente</span> : null}
                {preview.summary.duplicates > 0 ? <span className="text-[var(--danger)]">⚠️ {preview.summary.duplicates} doublon{preview.summary.duplicates > 1 ? "s" : ""}</span> : null}
              </div>

              {unknownChildRows.length > 0 ? (
                <div className="rounded-xl bg-[var(--warning-bg)] p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--brand-gold)]">Enfants inconnus</p>
                  <ul className="space-y-1 text-sm text-[var(--foreground)]">
                    {unknownChildRows.map((r, i) => (
                      <li key={i}>❓ {r.row.firstName} {r.row.lastName} ({r.row.activityName})</li>
                    ))}
                  </ul>
                  <label className="mt-2 flex items-center gap-2 text-sm font-medium">
                    <input type="checkbox" checked={createUnknownChildren} onChange={(e) => setCreateUnknownChildren(e.target.checked)} />
                    Créer leur fiche enfant et les ajouter à la semaine
                  </label>
                </div>
              ) : null}

              {unknownActivityRows.length > 0 ? (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--danger)]">Activité inconnue (non importées)</p>
                  <ul className="space-y-1 text-sm text-red-800">
                    {unknownActivityRows.map((r, i) => (
                      <li key={i}>❌ {r.row.firstName} {r.row.lastName} : &quot;{r.row.activityName}&quot;</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {weekMismatchRows.length > 0 ? (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--danger)]">Semaine différente (non importées)</p>
                  <ul className="space-y-1 text-sm text-red-800">
                    {weekMismatchRows.map((r, i) => (
                      <li key={i}>📅 {r.row.firstName} {r.row.lastName} : {r.message}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {duplicateRows.length > 0 ? (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--danger)]">Doublons dans le fichier (une seule occurrence importée)</p>
                  <ul className="space-y-1 text-sm text-red-800">
                    {duplicateRows.map((r, i) => (
                      <li key={i}>⚠️ {r.row.firstName} {r.row.lastName}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending || preview.summary.matched + (createUnknownChildren ? preview.summary.unknownChildren : 0) === 0}
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
