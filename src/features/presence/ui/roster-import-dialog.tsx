"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { RosterFieldKey } from "@/features/presence/application/roster-import";
import type { RosterImportOutcome, RosterImportRow, RosterImportSummary, RosterImportStatus } from "@/features/presence/application/commands";

// Duplicated (not imported) on purpose: roster-import.ts pulls in the
// server-only exceljs package via excel-import.ts, which must never end up
// in the client bundle — only `import type` from that module is safe here.
const ROSTER_FIELD_LABELS: Record<RosterFieldKey, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  fullName: "Nom complet",
  activityName: "Activité",
  daycareAuto: "Garderie",
  notes: "Notes",
};

interface DetectedHeader {
  index: number;
  text: string;
  autoField: RosterFieldKey | null;
}

interface PreviewResponse {
  summary: RosterImportSummary;
  outcomes: RosterImportOutcome[];
  sheetNames: string[];
}

interface MultiSheetResponse {
  multipleSheets: true;
  sheetNames: string[];
}

interface NeedsMappingResponse {
  needsColumnMapping: true;
  headers: DetectedHeader[];
  sheetName: string;
}

type Step = "pick" | "choose-sheet" | "map-columns" | "preview" | "confirm" | "done";

const STATUS_LABEL: Record<RosterImportStatus, string> = {
  NEW_CHILD: "Nouveau",
  KNOWN_CHILD: "Déjà connu",
  ALREADY_ENROLLED: "Déjà inscrit",
  UNKNOWN_ACTIVITY: "Activité inconnue",
  DUPLICATE: "Doublon",
  ERROR: "Erreur",
};

const STATUS_COLOR: Record<RosterImportStatus, string> = {
  NEW_CHILD: "text-[var(--success)]",
  KNOWN_CHILD: "text-[var(--brand-blue)]",
  ALREADY_ENROLLED: "text-[var(--muted)]",
  UNKNOWN_ACTIVITY: "text-[var(--danger)]",
  DUPLICATE: "text-[var(--brand-gold)]",
  ERROR: "text-[var(--danger)]",
};

function rowKey(sheetName: string, row: number): string {
  return `${sheetName}:${row}`;
}

/** Manual fallback for splitting a "Nom complet" cell — always available
 * regardless of whether an AI suggestion came back, so the import never
 * depends on OpenAI being configured or reachable to be usable. */
function ManualNameSplit({ disabled, onApply }: { disabled: boolean; onApply: (firstName: string, lastName: string) => void }) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <input
        value={firstName}
        onChange={(e) => setFirstName(e.target.value)}
        placeholder="Prénom"
        className="h-8 w-28 rounded-lg border border-[var(--border)] bg-white px-2 text-xs"
      />
      <input
        value={lastName}
        onChange={(e) => setLastName(e.target.value)}
        placeholder="Nom"
        className="h-8 w-28 rounded-lg border border-[var(--border)] bg-white px-2 text-xs"
      />
      <button
        type="button"
        disabled={disabled || !firstName.trim() || !lastName.trim()}
        onClick={() => onApply(firstName.trim(), lastName.trim())}
        className="tap-scale h-8 rounded-lg border border-[var(--border)] bg-white px-2.5 text-xs font-semibold text-[var(--foreground)] disabled:opacity-50"
      >
        Valider
      </button>
    </div>
  );
}

export function RosterImportDialog({
  weekStart,
  weekLabel,
  activities,
}: {
  weekStart: string;
  weekLabel: string;
  activities: Array<{ id: string; name: string }>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const [step, setStep] = useState<Step>("pick");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [mappingHeaders, setMappingHeaders] = useState<DetectedHeader[]>([]);
  const [mappingDraft, setMappingDraft] = useState<Record<number, RosterFieldKey | "ignore">>({});
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [activityOverrides, setActivityOverrides] = useState<Record<string, string>>({});
  const [nameOverrides, setNameOverrides] = useState<Record<string, { firstName: string; lastName: string }>>({});
  // Captured once, when the file is picked, and reused for every later
  // re-preview (column mapping, activity/name corrections). The <input
  // type="file"> only exists during the "pick" step — once the dialog moves
  // past it, fileInputRef.current is unmounted (null), so re-reading
  // .files from the ref on a later correction would silently lose the file.
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importAllSheets, setImportAllSheets] = useState(false);
  const [selectedSheetName, setSelectedSheetName] = useState<string | undefined>(undefined);
  const [result, setResult] = useState<{ ok: boolean; message: string; byActivity?: Array<{ activityName: string; count: number }> } | null>(null);

  function reset() {
    setStep("pick");
    setError(null);
    setSheetNames([]);
    setMappingHeaders([]);
    setMappingDraft({});
    setPreview(null);
    setActivityOverrides({});
    setNameOverrides({});
    setImportAllSheets(false);
    setSelectedSheetName(undefined);
    setResult(null);
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function open() {
    reset();
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function analyze(opts: {
    sheetName?: string;
    allSheets?: boolean;
    columnMapping?: Record<number, RosterFieldKey | "ignore">;
    overrides?: Record<string, string>;
    nameOverrides?: Record<string, { firstName: string; lastName: string }>;
  } = {}) {
    const file = selectedFile ?? fileInputRef.current?.files?.[0] ?? null;
    if (!file) {
      setError("Choisissez un fichier .xlsx.");
      return;
    }
    if (!selectedFile) setSelectedFile(file);
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("weekStart", weekStart);
      if (opts.sheetName) formData.append("sheetName", opts.sheetName);
      if (opts.allSheets) formData.append("importAllSheets", "true");
      if (opts.columnMapping) formData.append("columnMapping", JSON.stringify(opts.columnMapping));
      if (opts.overrides) formData.append("activityOverrides", JSON.stringify(opts.overrides));
      if (opts.nameOverrides) formData.append("nameOverrides", JSON.stringify(opts.nameOverrides));

      const res = await fetch("/api/admin/roster/import/preview", { method: "POST", body: formData });
      const json = (await res.json()) as (PreviewResponse | MultiSheetResponse | NeedsMappingResponse) & { error?: string };
      if (!res.ok) {
        setError(json.error ?? "Erreur lors de l'analyse du fichier.");
        return;
      }
      if ("multipleSheets" in json) {
        setSheetNames(json.sheetNames);
        setStep("choose-sheet");
        return;
      }
      if ("needsColumnMapping" in json) {
        setMappingHeaders(json.headers);
        setMappingDraft(Object.fromEntries(json.headers.map((h) => [h.index, h.autoField ?? "ignore"])));
        setStep("map-columns");
        return;
      }
      setPreview(json);
      setStep("preview");
    });
  }

  function chooseSheet(name: string) {
    setImportAllSheets(false);
    setSelectedSheetName(name);
    analyze({ sheetName: name });
  }

  function chooseAllSheets() {
    setImportAllSheets(true);
    setSelectedSheetName(undefined);
    analyze({ allSheets: true });
  }

  function submitMapping() {
    const mapped = Object.values(mappingDraft);
    const hasNames = (mapped.includes("firstName") && mapped.includes("lastName")) || mapped.includes("fullName");
    const missing: RosterFieldKey[] = [];
    if (!hasNames) missing.push("firstName", "lastName");
    if (!mapped.includes("activityName")) missing.push("activityName");
    if (missing.length > 0) {
      setError(`Associez au moins une colonne à : ${missing.map((f) => ROSTER_FIELD_LABELS[f]).join(", ")} (ou "Nom complet" pour Prénom+Nom).`);
      return;
    }
    analyze({ sheetName: selectedSheetName, allSheets: importAllSheets, columnMapping: mappingDraft });
  }

  function setActivityOverride(key: string, activityId: string) {
    const next = { ...activityOverrides, [key]: activityId };
    setActivityOverrides(next);
    analyze({
      sheetName: selectedSheetName,
      allSheets: importAllSheets,
      columnMapping: Object.keys(mappingDraft).length > 0 ? mappingDraft : undefined,
      overrides: next,
      nameOverrides: Object.keys(nameOverrides).length > 0 ? nameOverrides : undefined,
    });
  }

  /** Applies a name split — AI-suggested or picked by hand — only once the
   * admin explicitly clicks to accept it. Re-runs the preview so the row
   * moves out of ERROR with the corrected name, same flow as an activity
   * correction. */
  function setNameOverride(key: string, firstName: string, lastName: string) {
    const next = { ...nameOverrides, [key]: { firstName, lastName } };
    setNameOverrides(next);
    analyze({
      sheetName: selectedSheetName,
      allSheets: importAllSheets,
      columnMapping: Object.keys(mappingDraft).length > 0 ? mappingDraft : undefined,
      overrides: Object.keys(activityOverrides).length > 0 ? activityOverrides : undefined,
      nameOverrides: next,
    });
  }

  function goToConfirm() {
    setError(null);
    setStep("confirm");
  }

  function confirmImport() {
    if (!preview) return;
    const rows: RosterImportRow[] = preview.outcomes
      .filter((o) => o.status === "NEW_CHILD" || o.status === "KNOWN_CHILD" || o.status === "ALREADY_ENROLLED")
      .map((o) => o.row);

    if (rows.length === 0) {
      setError("Aucune ligne à importer.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await fetch("/api/admin/roster/import/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows, weekStart }),
      });
      const json = (await res.json()) as {
        ok?: boolean;
        addedCount?: number;
        createdChildrenCount?: number;
        knownChildrenCount?: number;
        skippedCount?: number;
        byActivity?: Array<{ activityId: string; activityName: string; count: number }>;
        error?: string;
      };
      if (!res.ok || !json.ok) {
        setResult({ ok: false, message: json.error ?? "Import annulé : aucune modification effectuée." });
      } else {
        setResult({
          ok: true,
          message: `${json.addedCount} participant${(json.addedCount ?? 0) > 1 ? "s" : ""} importé${(json.addedCount ?? 0) > 1 ? "s" : ""}.`,
          byActivity: json.byActivity?.map((a) => ({ activityName: a.activityName, count: a.count })),
        });
        router.refresh();
      }
      setStep("done");
    });
  }

  const rowsByStatus = useMemo(() => {
    const groups: Record<RosterImportStatus, RosterImportOutcome[]> = {
      NEW_CHILD: [],
      KNOWN_CHILD: [],
      ALREADY_ENROLLED: [],
      UNKNOWN_ACTIVITY: [],
      DUPLICATE: [],
      ERROR: [],
    };
    for (const o of preview?.outcomes ?? []) groups[o.status].push(o);
    return groups;
  }, [preview]);

  const importableCount = preview
    ? preview.summary.newChildren + preview.summary.knownChildren + preview.summary.alreadyEnrolled
    : 0;

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-11 rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]"
      >
        📥 Importer Excel
      </button>
      <dialog ref={dialogRef} className="w-full max-w-2xl rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Importer les participants</h2>
          <p className="mt-1 text-xs font-semibold text-[var(--primary)]">Semaine ciblée : {weekLabel}</p>

          {step === "pick" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm text-[var(--muted)]">
                Fichier .xlsx avec les colonnes Prénom, Nom (ou une seule colonne Nom complet), Activité (Garderie et Notes facultatives).
                L&apos;ordre des colonnes n&apos;a pas d&apos;importance. Vous verrez un aperçu classé par activité avant toute écriture — une IA peut
                suggérer une correction pour une activité non reconnue ou un nom non séparé, mais rien n&apos;est jamais appliqué sans votre confirmation.
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
                    onClick={() => chooseSheet(name)}
                    className="tap-scale block w-full rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left text-sm font-semibold text-[var(--foreground)] hover:border-[var(--primary)] disabled:opacity-50"
                  >
                    📄 Importer cette feuille : {name}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={isPending}
                  onClick={chooseAllSheets}
                  className="tap-scale block w-full rounded-xl border-2 border-[var(--primary)] bg-[var(--tint-blue-bg)] px-4 py-3 text-left text-sm font-bold text-[var(--primary)] disabled:opacity-50"
                >
                  📚 Importer toutes les feuilles ({sheetNames.length})
                </button>
              </div>
              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
              <button type="button" onClick={close} className="tap-scale h-11 w-full rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                Annuler
              </button>
            </div>
          ) : null}

          {step === "map-columns" ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-semibold text-[var(--danger)]">Colonne(s) non reconnue(s) automatiquement.</p>
              <p className="text-sm text-[var(--muted)]">Indiquez à quoi correspond chaque colonne détectée dans le fichier :</p>
              <div className="space-y-2">
                {mappingHeaders.map((h) => (
                  <div key={h.index} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3.5 py-2.5">
                    <span className="text-sm font-semibold text-[var(--foreground)]">&quot;{h.text}&quot; correspond à :</span>
                    <select
                      value={mappingDraft[h.index] ?? "ignore"}
                      onChange={(e) => setMappingDraft((prev) => ({ ...prev, [h.index]: e.target.value as RosterFieldKey | "ignore" }))}
                      className="h-10 rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm"
                    >
                      <option value="ignore">Ignorer</option>
                      {(Object.keys(ROSTER_FIELD_LABELS) as RosterFieldKey[]).map((field) => (
                        <option key={field} value={field}>
                          {ROSTER_FIELD_LABELS[field]}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={submitMapping}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Analyse…" : "Continuer"}
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          {step === "preview" && preview ? (
            <div className="mt-4 space-y-4">
              <p className="text-sm font-semibold text-[var(--foreground)]">
                {preview.summary.total} ligne{preview.summary.total > 1 ? "s" : ""} détectée{preview.summary.total > 1 ? "s" : ""}
              </p>

              {preview.summary.byActivity.length > 0 ? (
                <div className="rounded-xl bg-[var(--tint-blue-bg)] p-3">
                  <p className="mb-1 text-xs font-bold uppercase tracking-wide text-[var(--brand-blue)]">Classement par activité</p>
                  <ul className="text-sm text-[var(--foreground)]">
                    {preview.summary.byActivity.map((a) => (
                      <li key={a.activityId}>{a.activityName} : {a.count}</li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                <span className="text-[var(--success)]">🆕 {preview.summary.newChildren} nouveau{preview.summary.newChildren > 1 ? "x" : ""}</span>
                <span className="text-[var(--brand-blue)]">👤 {preview.summary.knownChildren} déjà connu{preview.summary.knownChildren > 1 ? "s" : ""}</span>
                <span className="text-[var(--muted)]">✅ {preview.summary.alreadyEnrolled} déjà inscrit{preview.summary.alreadyEnrolled > 1 ? "s" : ""}</span>
                <span className="text-[var(--brand-gold)]">⚠️ {preview.summary.duplicates} doublon{preview.summary.duplicates > 1 ? "s" : ""}</span>
                <span className="text-[var(--danger)]">❌ {preview.summary.errors} erreur{preview.summary.errors > 1 ? "s" : ""}</span>
              </div>

              {rowsByStatus.UNKNOWN_ACTIVITY.length > 0 ? (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--danger)]">Activité inconnue — corrigez ou la ligne sera ignorée</p>
                  <ul className="space-y-2">
                    {rowsByStatus.UNKNOWN_ACTIVITY.map((o) => {
                      const key = rowKey(o.row.sheetName, o.row.row);
                      const suggestedActivity = o.aiSuggestion?.activityName ? activities.find((a) => a.name === o.aiSuggestion?.activityName) : undefined;
                      return (
                        <li key={key} className="flex flex-col gap-1.5 text-sm">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-red-800">
                              Ligne {o.row.row} : {o.row.firstName} {o.row.lastName} ({o.row.activityName || "vide"})
                            </span>
                            <select
                              defaultValue=""
                              onChange={(e) => e.target.value && setActivityOverride(key, e.target.value)}
                              className="h-9 rounded-lg border border-[var(--border)] bg-white px-2 text-xs"
                            >
                              <option value="" disabled>
                                Choisir une activité
                              </option>
                              {activities.map((a) => (
                                <option key={a.id} value={a.id}>
                                  {a.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          {suggestedActivity ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => setActivityOverride(key, suggestedActivity.id)}
                              className="tap-scale self-start rounded-lg border border-[var(--brand-blue)] bg-[var(--tint-blue-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-blue)] disabled:opacity-50"
                            >
                              🤖 IA suggère : {suggestedActivity.name} — Appliquer
                            </button>
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              {rowsByStatus.ERROR.some((o) => o.row.fullName?.trim() && !o.row.firstName.trim() && !o.row.lastName.trim()) ? (
                <div className="rounded-xl bg-red-50 p-3">
                  <p className="mb-2 text-xs font-bold uppercase tracking-wide text-[var(--danger)]">Nom non séparé — corrigez ou la ligne sera ignorée</p>
                  <ul className="space-y-2">
                    {rowsByStatus.ERROR.filter((o) => o.row.fullName?.trim() && !o.row.firstName.trim() && !o.row.lastName.trim()).map((o) => {
                      const key = rowKey(o.row.sheetName, o.row.row);
                      const suggestion = o.aiSuggestion;
                      return (
                        <li key={key} className="flex flex-col gap-1.5 text-sm">
                          <span className="text-red-800">
                            Ligne {o.row.row} : &quot;{o.row.fullName}&quot;
                          </span>
                          {suggestion?.firstName && suggestion?.lastName ? (
                            <button
                              type="button"
                              disabled={isPending}
                              onClick={() => setNameOverride(key, suggestion.firstName!, suggestion.lastName!)}
                              className="tap-scale self-start rounded-lg border border-[var(--brand-blue)] bg-[var(--tint-blue-bg)] px-2.5 py-1 text-xs font-semibold text-[var(--brand-blue)] disabled:opacity-50"
                            >
                              🤖 IA suggère : {suggestion.firstName} / {suggestion.lastName} — Appliquer
                            </button>
                          ) : null}
                          <ManualNameSplit disabled={isPending} onApply={(fn, ln) => setNameOverride(key, fn, ln)} />
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : null}

              <div className="overflow-x-auto rounded-xl border border-[var(--border)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--background)] text-xs font-bold uppercase tracking-wide text-[var(--muted)]">
                    <tr>
                      <th className="px-3 py-2">Ligne</th>
                      <th className="px-3 py-2">Prénom</th>
                      <th className="px-3 py-2">Nom</th>
                      <th className="px-3 py-2">Activité</th>
                      <th className="px-3 py-2">Garderie</th>
                      <th className="px-3 py-2">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border)]">
                    {preview.outcomes.map((o) => (
                      <tr key={rowKey(o.row.sheetName, o.row.row)}>
                        <td className="px-3 py-2 text-[var(--muted)]">{o.row.row}</td>
                        <td className="px-3 py-2">{o.row.firstName}</td>
                        <td className="px-3 py-2">{o.row.lastName}</td>
                        <td className="px-3 py-2">{o.activityName ?? o.row.activityName}</td>
                        <td className="px-3 py-2">{o.row.garderie}</td>
                        <td className={`px-3 py-2 font-semibold ${STATUS_COLOR[o.status]}`}>{STATUS_LABEL[o.status]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={importableCount === 0}
                  onClick={goToConfirm}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  Continuer ({importableCount})
                </button>
                <button type="button" onClick={close} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Annuler
                </button>
              </div>
            </div>
          ) : null}

          {step === "confirm" && preview ? (
            <div className="mt-4 space-y-4">
              <p className="text-base font-bold text-[var(--foreground)]">
                Vous êtes sur le point d&apos;importer {importableCount} participant{importableCount > 1 ? "s" : ""}.
              </p>
              <div className="rounded-xl bg-[var(--tint-blue-bg)] p-3">
                <ul className="text-sm text-[var(--foreground)]">
                  {preview.summary.byActivity.map((a) => (
                    <li key={a.activityId}>{a.activityName} : {a.count}</li>
                  ))}
                </ul>
              </div>
              <p className="text-xs text-[var(--muted)]">
                Semaine du {weekLabel}. {preview.summary.newChildren} nouvelle{preview.summary.newChildren > 1 ? "s" : ""} fiche{preview.summary.newChildren > 1 ? "s" : ""} enfant sera{preview.summary.newChildren > 1 ? "ont" : ""} créée{preview.summary.newChildren > 1 ? "s" : ""}. Aucune séance ni historique n&apos;est modifié.
              </p>
              {error ? <p role="alert" className="text-sm font-medium text-[var(--danger)]">{error}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending}
                  onClick={confirmImport}
                  className="tap-scale h-12 flex-1 rounded-xl bg-[var(--foreground)] text-sm font-bold text-white disabled:opacity-50"
                >
                  {isPending ? "Import en cours…" : "Confirmer l'import"}
                </button>
                <button type="button" onClick={() => setStep("preview")} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
                  Retour
                </button>
              </div>
            </div>
          ) : null}

          {step === "done" && result ? (
            <div className="mt-4 space-y-4 text-center">
              <p className="text-4xl">{result.ok ? "✅" : "❌"}</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">{result.ok ? "Import terminé" : "Import annulé"}</p>
              <p className="text-sm text-[var(--foreground)]">{result.message}</p>
              {result.byActivity && result.byActivity.length > 0 ? (
                <ul className="text-sm text-[var(--muted)]">
                  {result.byActivity.map((a) => (
                    <li key={a.activityName}>{a.activityName} : {a.count}</li>
                  ))}
                </ul>
              ) : null}
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
