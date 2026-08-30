import ExcelJS from "exceljs";
import type { ActivityRecord, ChildRecord } from "@/server/data-source";

export const EXCEL_COLUMNS = ["Prénom", "Nom", "Activité", "Garderie", "Actif", "Notes"] as const;

export const MAX_IMPORT_ROWS = 1000;
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024; // 5 MB

export interface RawImportRow {
  row: number; // 1-indexed spreadsheet row, header is row 1
  firstName: string;
  lastName: string;
  activityName: string;
  garderie: string;
  active: string;
  notes: string;
}

export interface ValidatedChildInput {
  firstName: string;
  lastName: string;
  activityId: string;
  activityName: string;
  daycareAuto: boolean;
  active: boolean;
  notes: string;
}

export type ImportRowOutcome =
  | { row: number; status: "valid"; data: ValidatedChildInput }
  | { row: number; status: "duplicate"; data: ValidatedChildInput; message: string }
  | { row: number; status: "error"; message: string };

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

/** Accepts common spellings/casing so a non-technical person filling the
 * template by hand isn't tripped up by accents or capitalization. */
export function parseYesNo(value: string, fieldLabel: string): { ok: true; value: boolean } | { ok: false; message: string } {
  const v = normalize(value);
  if (v === "" ) return { ok: true, value: false };
  if (["oui", "o", "yes", "y", "true", "1"].includes(v)) return { ok: true, value: true };
  if (["non", "n", "no", "false", "0"].includes(v)) return { ok: true, value: false };
  return { ok: false, message: `${fieldLabel} : valeur "${value}" non reconnue (utilisez Oui ou Non).` };
}

function matchActivity(activityName: string, activities: ActivityRecord[]): ActivityRecord | undefined {
  const target = normalize(activityName);
  return activities.find((a) => normalize(a.name) === target);
}

/**
 * Pure validation, no I/O — used identically by the preview endpoint and (as
 * a defensive re-check) the commit endpoint, so a client can never bypass
 * server-side validation by tampering with what it sends back after preview.
 */
export function validateImportRows(
  rawRows: RawImportRow[],
  activities: ActivityRecord[],
  existingChildren: ChildRecord[],
): ImportRowOutcome[] {
  const existingKeys = new Set(
    existingChildren.map((c) => `${normalize(c.firstName)}|${normalize(c.lastName)}|${c.activityId}`),
  );
  const seenInFile = new Set<string>();
  const results: ImportRowOutcome[] = [];

  for (const raw of rawRows) {
    const firstName = raw.firstName.trim();
    const lastName = raw.lastName.trim();
    const activityNameRaw = raw.activityName.trim();

    if (!firstName && !lastName && !activityNameRaw) {
      continue; // fully blank row — silently skipped, not counted as an error
    }
    if (!firstName) {
      results.push({ row: raw.row, status: "error", message: "Prénom manquant." });
      continue;
    }
    if (!lastName) {
      results.push({ row: raw.row, status: "error", message: "Nom manquant." });
      continue;
    }
    if (!activityNameRaw) {
      results.push({ row: raw.row, status: "error", message: "Activité manquante." });
      continue;
    }
    const activity = matchActivity(activityNameRaw, activities);
    if (!activity) {
      results.push({ row: raw.row, status: "error", message: `Activité "${activityNameRaw}" inconnue.` });
      continue;
    }
    const garderie = parseYesNo(raw.garderie, "Garderie");
    if (!garderie.ok) {
      results.push({ row: raw.row, status: "error", message: garderie.message });
      continue;
    }
    const active = parseYesNo(raw.active, "Actif");
    if (!active.ok) {
      results.push({ row: raw.row, status: "error", message: active.message });
      continue;
    }
    if (raw.notes.length > 2000) {
      results.push({ row: raw.row, status: "error", message: "Notes : 2000 caractères maximum." });
      continue;
    }

    const data: ValidatedChildInput = {
      firstName,
      lastName,
      activityId: activity.id,
      activityName: activity.name,
      daycareAuto: garderie.value,
      active: raw.active.trim() === "" ? true : active.value,
      notes: raw.notes.trim(),
    };

    const key = `${normalize(firstName)}|${normalize(lastName)}|${activity.id}`;
    if (existingKeys.has(key)) {
      results.push({ row: raw.row, status: "duplicate", data, message: "Un enfant du même nom existe déjà dans cette activité." });
      continue;
    }
    if (seenInFile.has(key)) {
      results.push({ row: raw.row, status: "duplicate", data, message: "Doublon avec une autre ligne de ce fichier." });
      continue;
    }
    seenInFile.add(key);
    results.push({ row: raw.row, status: "valid", data });
  }

  return results;
}

export class ImportFileError extends Error {}

/** Thrown specifically when the workbook has more than one sheet and the
 * caller hasn't said which one to use yet — carries the sheet list so the
 * route can hand it back to the client instead of guessing. */
export class MultipleSheetsError extends Error {
  constructor(public readonly sheetNames: string[]) {
    super("Plusieurs feuilles détectées.");
  }
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value);
}

type FieldKey = "firstName" | "lastName" | "activityName" | "garderie" | "active" | "notes";

// Deliberately small, fixed lists — not fuzzy/"smart" matching. A header
// that isn't recognized is reported to the admin rather than guessed at.
const COLUMN_VARIANTS: Record<FieldKey, string[]> = {
  firstName: ["prenom", "prenoms", "prenom(s)", "first name", "firstname"],
  lastName: ["nom", "noms", "last name", "lastname", "nom de famille", "surname"],
  activityName: ["activite", "activites", "activity"],
  garderie: ["garderie", "daycare"],
  active: ["actif", "active"],
  notes: ["notes", "note", "remarque", "remarques", "commentaire", "commentaires"],
};

const REQUIRED_FIELDS: FieldKey[] = ["firstName", "lastName", "activityName"];
const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  activityName: "Activité",
  garderie: "Garderie",
  active: "Actif",
  notes: "Notes",
};

function matchHeaderField(headerText: string): FieldKey | null {
  const normalized = normalize(headerText);
  for (const [field, variants] of Object.entries(COLUMN_VARIANTS) as [FieldKey, string[]][]) {
    if (variants.includes(normalized)) return field;
  }
  return null;
}

/**
 * Maps header text to fields regardless of column order, so "Nom | Prénom |
 * Activité" works the same as the official template's order. A header that
 * matches more than one column, or a missing required column, is reported
 * back rather than guessed — this is deliberately not "smart" recognition.
 */
function resolveColumnMap(headerRow: ExcelJS.Row): Map<FieldKey, number> {
  const map = new Map<FieldKey, number>();
  const ambiguous: FieldKey[] = [];

  headerRow.eachCell((cell, colNumber) => {
    const field = matchHeaderField(cellText(cell.value));
    if (!field) return;
    if (map.has(field)) {
      if (!ambiguous.includes(field)) ambiguous.push(field);
      return;
    }
    map.set(field, colNumber);
  });

  if (ambiguous.length > 0) {
    throw new ImportFileError(
      `Colonne ambiguë : plusieurs colonnes correspondent à ${ambiguous.map((f) => FIELD_LABELS[f]).join(", ")}. Corrigez les en-têtes du fichier.`,
    );
  }

  const missing = REQUIRED_FIELDS.filter((f) => !map.has(f));
  if (missing.length > 0) {
    throw new ImportFileError(
      `Colonne(s) obligatoire(s) introuvable(s) : ${missing.map((f) => FIELD_LABELS[f]).join(", ")}. Utilisez le modèle officiel ou vérifiez les en-têtes.`,
    );
  }

  return map;
}

/**
 * Never trusts the upload: extension and size are checked before a single
 * byte is parsed, and only plain cell values are ever read — exceljs does
 * not execute macros or formulas.
 */
export async function loadWorkbook(fileName: string, buffer: Buffer): Promise<ExcelJS.Workbook> {
  if (!/\.xlsx$/i.test(fileName)) {
    throw new ImportFileError("Seuls les fichiers .xlsx sont acceptés.");
  }
  if (buffer.byteLength > MAX_IMPORT_FILE_BYTES) {
    throw new ImportFileError(`Fichier trop volumineux (max ${MAX_IMPORT_FILE_BYTES / 1024 / 1024} Mo).`);
  }

  const workbook = new ExcelJS.Workbook();
  try {
    // A transitive dependency (fast-csv, via exceljs) bundles its own older
    // @types/node, so exceljs's declared Buffer type doesn't structurally
    // match this file's Buffer — a type-only mismatch, not a real one (both
    // are the same Node Buffer at runtime).
    await workbook.xlsx.load(buffer as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  } catch {
    throw new ImportFileError("Fichier illisible — vérifiez qu'il s'agit bien d'un fichier Excel (.xlsx) valide.");
  }
  if (workbook.worksheets.length === 0) {
    throw new ImportFileError("Le fichier ne contient aucune feuille.");
  }
  return workbook;
}

/**
 * Picks the target sheet: the only one if there's just one, the explicitly
 * requested one by name, or throws MultipleSheetsError so the caller can ask
 * the admin to choose rather than silently picking one.
 */
export function selectSheet(workbook: ExcelJS.Workbook, requestedSheetName?: string): ExcelJS.Worksheet {
  if (requestedSheetName) {
    const sheet = workbook.getWorksheet(requestedSheetName);
    if (!sheet) throw new ImportFileError(`Feuille "${requestedSheetName}" introuvable.`);
    return sheet;
  }
  if (workbook.worksheets.length > 1) {
    throw new MultipleSheetsError(workbook.worksheets.map((s) => s.name));
  }
  return workbook.worksheets[0];
}

export function parseSheetRows(sheet: ExcelJS.Worksheet): RawImportRow[] {
  const headerRow = sheet.getRow(1);
  const columnMap = resolveColumnMap(headerRow);

  const get = (row: ExcelJS.Row, field: FieldKey): string => {
    const col = columnMap.get(field);
    return col ? cellText(row.getCell(col).value) : "";
  };

  const rows: RawImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    rows.push({
      row: rowNumber,
      firstName: get(row, "firstName"),
      lastName: get(row, "lastName"),
      activityName: get(row, "activityName"),
      garderie: get(row, "garderie"),
      active: get(row, "active"),
      notes: get(row, "notes"),
    });
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Trop de lignes (max ${MAX_IMPORT_ROWS}).`);
  }
  if (rows.length === 0) {
    throw new ImportFileError("Le fichier ne contient aucune ligne de données.");
  }

  return rows;
}
