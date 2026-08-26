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
function parseYesNo(value: string, fieldLabel: string): { ok: true; value: boolean } | { ok: false; message: string } {
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

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value);
}

/**
 * Never trusts the upload: extension, size, and row-count are all checked
 * before a single cell is read, and only the first worksheet's plain cell
 * values are ever touched — exceljs does not execute macros or formulas, it
 * only ever returns computed/text values.
 */
export async function parseImportFile(fileName: string, buffer: Buffer): Promise<RawImportRow[]> {
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

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    throw new ImportFileError("Le fichier ne contient aucune feuille.");
  }

  const rows: RawImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return; // header
    rows.push({
      row: rowNumber,
      firstName: cellText(row.getCell(1).value),
      lastName: cellText(row.getCell(2).value),
      activityName: cellText(row.getCell(3).value),
      garderie: cellText(row.getCell(4).value),
      active: cellText(row.getCell(5).value),
      notes: cellText(row.getCell(6).value),
    });
  });

  if (rows.length > MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Trop de lignes (max ${MAX_IMPORT_ROWS}).`);
  }

  return rows;
}
