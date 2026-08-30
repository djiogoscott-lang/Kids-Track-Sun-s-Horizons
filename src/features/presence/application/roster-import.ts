import type ExcelJS from "exceljs";
import { ImportFileError } from "./excel-import";

export const ROSTER_MAX_IMPORT_ROWS = 1000;

export type RosterFieldKey = "firstName" | "lastName" | "fullName" | "activityName" | "daycareAuto" | "notes";

export const ROSTER_FIELD_LABELS: Record<RosterFieldKey, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  fullName: "Nom complet",
  activityName: "Activité",
  daycareAuto: "Garderie",
  notes: "Notes",
};

// firstName+lastName is the default expectation, but a file with a single
// "Nom complet" column is also accepted — see isColumnMappingComplete, which
// treats fullName as an alternative to the firstName/lastName pair rather
// than a third required field.
const REQUIRED_FIELDS: RosterFieldKey[] = ["firstName", "lastName", "activityName"];

const COLUMN_VARIANTS: Record<RosterFieldKey, string[]> = {
  firstName: ["prenom", "prenoms", "prenom(s)", "first name", "firstname"],
  lastName: ["nom", "noms", "last name", "lastname", "nom de famille", "surname"],
  fullName: ["nom complet", "nom et prenom", "prenom et nom", "prenom nom", "nom prenom", "full name", "fullname"],
  activityName: ["activite", "activites", "activity"],
  daycareAuto: ["garderie", "daycare"],
  notes: ["notes", "note", "remarque", "remarques", "commentaire", "commentaires"],
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .trim()
    .toLowerCase();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  return String(value);
}

function matchHeaderField(headerText: string): RosterFieldKey | null {
  const normalized = normalize(headerText);
  for (const [field, variants] of Object.entries(COLUMN_VARIANTS) as [RosterFieldKey, string[]][]) {
    if (variants.includes(normalized)) return field;
  }
  return null;
}

export interface DetectedHeader {
  index: number; // 1-indexed spreadsheet column
  text: string; // raw header text, exactly as it appears in the file
  autoField: RosterFieldKey | null; // best-guess automatic match, or null if unrecognized
}

/** Never throws — always hands back what it saw, even an empty/garbled
 * header row, so the caller can decide between the fast auto-detected path
 * and asking the admin to map columns by hand ("Cette colonne correspond
 * à…"). Blank header cells are skipped (not every column needs a name). */
export function detectHeaders(sheet: ExcelJS.Worksheet): DetectedHeader[] {
  const headerRow = sheet.getRow(1);
  const headers: DetectedHeader[] = [];
  headerRow.eachCell((cell, colNumber) => {
    const text = cellText(cell.value).trim();
    if (!text) return;
    headers.push({ index: colNumber, text, autoField: matchHeaderField(text) });
  });
  return headers;
}

export type ColumnMapping = Record<number, RosterFieldKey | "ignore">;

/**
 * A column mapping is usable as-is only when every required field maps to
 * exactly one column — anything else (a required field missing, or two
 * columns claiming the same field) means the admin needs to resolve it by
 * hand rather than the app guessing wrong silently.
 *
 * activityName is the one exception: when every sheet actually being read
 * has a name that itself matches a known activity (the one-tab-per-activity
 * file shape), the column is legitimately allowed to be absent — the sheet
 * name fills in for it per row (see parseSheetRowsWithMapping). Pass
 * `activityNameOptional: true` only when that holds for every selected sheet.
 */
export function isColumnMappingComplete(headers: DetectedHeader[], mapping: ColumnMapping, activityNameOptional = false): boolean {
  const fieldCounts = new Map<RosterFieldKey, number>();
  for (const h of headers) {
    const field = mapping[h.index];
    if (!field || field === "ignore") continue;
    fieldCounts.set(field, (fieldCounts.get(field) ?? 0) + 1);
  }
  const hasSeparateNames = fieldCounts.get("firstName") === 1 && fieldCounts.get("lastName") === 1;
  const hasFullName = fieldCounts.get("fullName") === 1;
  if (!hasSeparateNames && !hasFullName) return false;
  return REQUIRED_FIELDS.every((f) => {
    if (f === "activityName" && activityNameOptional) return true;
    if (f === "firstName" || f === "lastName") return true; // covered by the hasSeparateNames/hasFullName check above
    return fieldCounts.get(f) === 1;
  });
}

export function autoColumnMapping(headers: DetectedHeader[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const h of headers) mapping[h.index] = h.autoField ?? "ignore";
  return mapping;
}

export interface RawRosterImportRow {
  row: number; // 1-indexed spreadsheet row, header is row 1
  sheetName: string;
  firstName: string;
  lastName: string;
  /** Raw text of a single "Nom complet" column, only populated when the file
   * has no separate firstName/lastName columns — used to offer an AI-assisted
   * split suggestion in the preview UI, never auto-applied. */
  fullName: string;
  activityName: string;
  garderie: string; // raw "Oui"/"Non"-shaped text, parsed downstream
  notes: string;
}

/**
 * Parses one sheet using an already-resolved column mapping (auto-detected
 * or supplied by the admin after a "colonne non reconnue" correction).
 * sheetActivityFallback covers the one-sheet-per-activity file shape (a
 * workbook with a "Danse" tab, a "Multisport" tab, etc.): a row with no
 * Activité column, or a blank cell in it, inherits the sheet's own name
 * when that name happens to match a known activity.
 */
export function parseSheetRowsWithMapping(
  sheet: ExcelJS.Worksheet,
  mapping: ColumnMapping,
  sheetActivityFallback: string | null,
): RawRosterImportRow[] {
  const columnFor = (field: RosterFieldKey): number | undefined => {
    for (const [colStr, mapped] of Object.entries(mapping)) {
      if (mapped === field) return Number(colStr);
    }
    return undefined;
  };
  const cols = {
    firstName: columnFor("firstName"),
    lastName: columnFor("lastName"),
    fullName: columnFor("fullName"),
    activityName: columnFor("activityName"),
    daycareAuto: columnFor("daycareAuto"),
    notes: columnFor("notes"),
  };

  const get = (row: ExcelJS.Row, col: number | undefined): string => (col ? cellText(row.getCell(col).value) : "");

  const rows: RawRosterImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    const activityName = get(row, cols.activityName).trim() || sheetActivityFallback || "";
    rows.push({
      row: rowNumber,
      sheetName: sheet.name,
      firstName: get(row, cols.firstName),
      lastName: get(row, cols.lastName),
      fullName: get(row, cols.fullName),
      activityName,
      garderie: get(row, cols.daycareAuto),
      notes: get(row, cols.notes),
    });
  });

  if (rows.length === 0) {
    throw new ImportFileError(`La feuille "${sheet.name}" ne contient aucune ligne de données.`);
  }

  return rows;
}
