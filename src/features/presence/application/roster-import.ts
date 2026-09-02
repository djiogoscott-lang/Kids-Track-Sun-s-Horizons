import type ExcelJS from "exceljs";
import { ImportFileError } from "./excel-import";

export const ROSTER_MAX_IMPORT_ROWS = 1000;

export type RosterFieldKey =
  | "firstName"
  | "lastName"
  | "fullName"
  | "activityName"
  | "daycareAuto"
  | "schoolClass"
  | "birthDate"
  | "phone"
  | "email"
  | "notes";

export const ROSTER_FIELD_LABELS: Record<RosterFieldKey, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  fullName: "Nom complet",
  activityName: "Activité",
  daycareAuto: "Garderie",
  schoolClass: "Classe",
  birthDate: "Date de naissance",
  phone: "Téléphone",
  email: "E-mail",
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
  // "nom & prenom" is how real school lists label the single-name column.
  fullName: [
    "nom complet",
    "nom et prenom",
    "nom & prenom",
    "prenom et nom",
    "prenom & nom",
    "prenom nom",
    "nom prenom",
    "full name",
    "fullname",
    "eleve",
    "eleves",
    "enfant",
  ],
  activityName: ["activite", "activites", "activity"],
  daycareAuto: ["garderie", "daycare"],
  schoolClass: ["classe", "class", "niveau"],
  birthDate: ["date de naissance", "naissance", "ne le", "nee le", "birth date", "date of birth", "dob"],
  phone: ["tel", "tel.", "telephone", "gsm", "phone", "portable", "contact"],
  email: ["email", "e-mail", "mail", "courriel"],
  notes: ["notes", "note", "remarque", "remarques", "commentaire", "commentaires"],
};

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object" && "text" in value) return String((value as { text: unknown }).text ?? "");
  if (typeof value === "object" && "result" in value) return String((value as { result: unknown }).result ?? "");
  if (typeof value === "object" && "richText" in value) {
    return (value as { richText: Array<{ text: string }> }).richText.map((r) => r.text).join("");
  }
  return String(value);
}

/** A header cell may carry a note under it ("Garderie 12H30 à 13h30"), so the
 * match is on the leading label rather than the whole string. Exact match is
 * tried first so a precise header never loses to a looser prefix. */
function matchHeaderField(headerText: string): RosterFieldKey | null {
  const normalized = normalize(headerText);
  if (!normalized) return null;
  const entries = Object.entries(COLUMN_VARIANTS) as [RosterFieldKey, string[]][];
  for (const [field, variants] of entries) {
    if (variants.includes(normalized)) return field;
  }
  for (const [field, variants] of entries) {
    if (variants.some((v) => normalized.startsWith(v + " ") || normalized.startsWith(v + ":"))) return field;
  }
  return null;
}

export interface DetectedHeader {
  index: number; // 1-indexed spreadsheet column
  text: string; // raw header text, exactly as it appears in the file
  autoField: RosterFieldKey | null; // best-guess automatic match, or null if unrecognized
}

export interface DetectedHeaderRow {
  headers: DetectedHeader[];
  /** 1-indexed row the headers were found on. Data starts on the next row. */
  rowNumber: number;
}

const HEADER_SEARCH_DEPTH = 15;

/**
 * Finds the row that actually holds the column headers, instead of assuming
 * row 1. Real school lists open with a merged title banner and a date before
 * the header row — the CSPU lists put their headers on row 5, so reading row
 * 1 returned fifteen copies of "CSPU/LISTE GENERALE MERCREDI 2026-2027" and
 * the import could only fall back to manual mapping.
 *
 * The winner is the row within the first {@link HEADER_SEARCH_DEPTH} that
 * matches the most known field labels; ties go to the earliest row. When no
 * row matches anything, row 1 is returned as before so the caller still gets
 * the raw cells to offer for manual mapping.
 */
export function detectHeaderRow(sheet: ExcelJS.Worksheet): DetectedHeaderRow {
  let best: DetectedHeaderRow | null = null;
  let bestScore = 0;

  const limit = Math.min(HEADER_SEARCH_DEPTH, sheet.rowCount || HEADER_SEARCH_DEPTH);
  for (let rowNumber = 1; rowNumber <= limit; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    const headers: DetectedHeader[] = [];
    row.eachCell((cell, colNumber) => {
      const text = cellText(cell.value).trim();
      if (!text) return;
      headers.push({ index: colNumber, text, autoField: matchHeaderField(text) });
    });
    if (headers.length === 0) continue;

    // A merged banner repeats the same text across every column; that is a
    // title, never a header row.
    const distinct = new Set(headers.map((h) => normalize(h.text)));
    if (distinct.size === 1 && headers.length > 2) continue;

    const score = new Set(headers.filter((h) => h.autoField).map((h) => h.autoField)).size;
    if (score > bestScore) {
      bestScore = score;
      best = { headers, rowNumber };
    }
  }

  if (best) return best;
  const first = sheet.getRow(1);
  const headers: DetectedHeader[] = [];
  first.eachCell((cell, colNumber) => {
    const text = cellText(cell.value).trim();
    if (text) headers.push({ index: colNumber, text, autoField: matchHeaderField(text) });
  });
  return { headers, rowNumber: 1 };
}

/** Kept for callers that only need the columns. */
export function detectHeaders(sheet: ExcelJS.Worksheet): DetectedHeader[] {
  return detectHeaderRow(sheet).headers;
}

export type ColumnMapping = Record<number, RosterFieldKey | "ignore">;

/**
 * A column mapping is usable as-is only when every required field maps to
 * exactly one column — anything else (a required field missing, or two
 * columns claiming the same field) means the admin needs to resolve it by
 * hand rather than the app guessing wrong silently.
 *
 * Two exceptions:
 *  - activityName may be absent when the sheet name, or an explicitly chosen
 *    target activity, supplies it instead;
 *  - daycareAuto may map to SEVERAL columns. Real lists split it by time slot
 *    ("Garderie 12H30 à 13h30" and "Garderie 15h30 à 17h45"); a child in
 *    either slot is in daycare, so the columns are OR-ed rather than being
 *    treated as a conflict.
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
    if (f === "firstName" || f === "lastName") return true; // covered above
    return fieldCounts.get(f) === 1;
  });
}

export function autoColumnMapping(headers: DetectedHeader[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  for (const h of headers) mapping[h.index] = h.autoField ?? "ignore";
  return mapping;
}

/**
 * Splits "VERSTRAETE Gabriella" into a surname and a first name using the
 * convention every one of these lists follows: the surname is written in
 * capitals and comes first, the given name follows in normal case.
 *
 * Multi-word surnames fall out of this for free ("GARCIA HOLMBERG Gabriel",
 * "DE WALQUE Valentina", "SANTOS P. N. leana"). When the whole cell is
 * capitalised — "GORI GIACOMO", where the convention gives no signal — the
 * first token is taken as the surname and the rest as the given name, which
 * is the ordering the rest of the file uses. Returns null when the cell
 * holds a single word, because there is nothing to split and guessing would
 * invent a name.
 */
export function splitFullName(fullName: string): { firstName: string; lastName: string } | null {
  const cleaned = fullName.replace(/\s+/g, " ").trim();
  if (!cleaned) return null;
  const tokens = cleaned.split(" ");
  if (tokens.length < 2) return null;

  // "Mostly capitals", not "all capitals". Real lists contain surnames typed
  // with a stray lowercase run — "CAMPOLEoni Guido" — and requiring a perfect
  // all-caps token made the splitter see no surname prefix at all, fall back
  // to "last token is the surname", and register the child as
  // firstName "CAMPOLEoni" / lastName "Guido": the name inverted.
  //
  // Two capitals minimum and a clear majority of them keeps ordinary given
  // names out ("Guido" is 1 of 5, "Léonard" 1 of 7) while accepting a surname
  // the secretary shift-keyed imperfectly.
  const isUpper = (t: string) => {
    const letters = t.replace(/[^\p{L}]/gu, "");
    if (letters.length === 0) return false;
    if (letters === letters.toUpperCase()) return true;
    const caps = [...letters].filter((ch) => ch === ch.toUpperCase() && ch !== ch.toLowerCase()).length;
    return caps >= 2 && caps / letters.length >= 0.6;
  };

  let i = 0;
  while (i < tokens.length && isUpper(tokens[i])) i++;

  if (i === 0) {
    // No capitalised prefix at all ("Gabriella Verstraete"): treat the last
    // token as the surname, matching the other common ordering.
    return { firstName: tokens.slice(0, -1).join(" "), lastName: tokens[tokens.length - 1] };
  }
  if (i >= tokens.length) {
    // Entirely capitalised: first token is the surname.
    return { lastName: tokens[0], firstName: tokens.slice(1).join(" ") };
  }
  return { lastName: tokens.slice(0, i).join(" "), firstName: tokens.slice(i).join(" ") };
}

/**
 * Accepts both shapes these files mix: a real Excel date (already rendered
 * as YYYY-MM-DD by cellText) and free text like "24/07/2020". Returns an ISO
 * date string, or "" when the cell holds neither — never a guessed date.
 */
export function parseBirthDate(raw: string): string {
  const text = raw.trim();
  if (!text) return "";
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const m = text.match(/^(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})$/);
  if (m) {
    const [, d, mo, y] = m;
    const day = d.padStart(2, "0");
    const month = mo.padStart(2, "0");
    if (Number(month) >= 1 && Number(month) <= 12 && Number(day) >= 1 && Number(day) <= 31) {
      return `${y}-${month}-${day}`;
    }
  }
  return "";
}

export interface RawRosterImportRow {
  row: number; // 1-indexed spreadsheet row
  sheetName: string;
  firstName: string;
  lastName: string;
  /** Raw text of a single "Nom complet" column, kept so the preview can show
   * what was split and offer a correction when the split is not obvious. */
  fullName: string;
  activityName: string;
  garderie: string; // raw "Oui"/"X"-shaped text, parsed downstream
  schoolClass: string;
  birthDate: string; // ISO (YYYY-MM-DD) or ""
  phone: string;
  email: string;
  notes: string;
}

export interface ParseOptions {
  /** Activity every row belongs to, when the file itself does not name one.
   * Takes precedence over both the activity column and the sheet name: a
   * list handed over as "the CSPU maternelle list" says nothing per row. */
  targetActivityName?: string | null;
  /** Sheet name to use when it matches a known activity (one-tab-per-activity). */
  sheetActivityFallback?: string | null;
  /** Row the headers are on; data starts after it. Defaults to detection. */
  headerRowNumber?: number;
}

/**
 * Parses one sheet using an already-resolved column mapping (auto-detected
 * or supplied by the admin after a "colonne non reconnue" correction).
 */
export function parseSheetRowsWithMapping(sheet: ExcelJS.Worksheet, mapping: ColumnMapping, options: ParseOptions = {}): RawRosterImportRow[] {
  const columnsFor = (field: RosterFieldKey): number[] =>
    Object.entries(mapping)
      .filter(([, mapped]) => mapped === field)
      .map(([col]) => Number(col));
  const firstColumnFor = (field: RosterFieldKey): number | undefined => columnsFor(field)[0];

  const cols = {
    firstName: firstColumnFor("firstName"),
    lastName: firstColumnFor("lastName"),
    fullName: firstColumnFor("fullName"),
    activityName: firstColumnFor("activityName"),
    daycare: columnsFor("daycareAuto"), // several slots possible — OR-ed below
    schoolClass: firstColumnFor("schoolClass"),
    birthDate: firstColumnFor("birthDate"),
    phone: firstColumnFor("phone"),
    email: firstColumnFor("email"),
    notes: firstColumnFor("notes"),
  };

  const headerRowNumber = options.headerRowNumber ?? detectHeaderRow(sheet).rowNumber;
  const get = (row: ExcelJS.Row, col: number | undefined): string => (col ? cellText(row.getCell(col).value).trim() : "");

  const rows: RawRosterImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber <= headerRowNumber) return;

    let firstName = get(row, cols.firstName);
    let lastName = get(row, cols.lastName);
    const fullName = get(row, cols.fullName);
    if ((!firstName || !lastName) && fullName) {
      const split = splitFullName(fullName);
      if (split) {
        firstName = firstName || split.firstName;
        lastName = lastName || split.lastName;
      }
    }
    // A row with no name at all is spacing or a totals line, not a child.
    if (!firstName && !lastName && !fullName) return;

    const activityName = options.targetActivityName || get(row, cols.activityName) || options.sheetActivityFallback || "";
    const garderie = cols.daycare.some((col) => get(row, col) !== "") ? "Oui" : "Non";

    rows.push({
      row: rowNumber,
      sheetName: sheet.name,
      firstName,
      lastName,
      fullName,
      activityName,
      garderie,
      schoolClass: get(row, cols.schoolClass),
      birthDate: parseBirthDate(get(row, cols.birthDate)),
      phone: get(row, cols.phone),
      email: get(row, cols.email),
      notes: get(row, cols.notes),
    });
  });

  if (rows.length === 0) {
    throw new ImportFileError(`La feuille "${sheet.name}" ne contient aucune ligne de données.`);
  }
  if (rows.length > ROSTER_MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Trop de lignes (max ${ROSTER_MAX_IMPORT_ROWS}).`);
  }

  return rows;
}
