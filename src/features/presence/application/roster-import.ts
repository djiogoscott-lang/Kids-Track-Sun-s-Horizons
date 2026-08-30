import type ExcelJS from "exceljs";
import { ImportFileError } from "./excel-import";

export const ROSTER_MAX_IMPORT_ROWS = 1000;

export interface RawRosterImportRow {
  row: number; // 1-indexed spreadsheet row, header is row 1
  firstName: string;
  lastName: string;
  activityName: string;
  /** Optional — when present, checked against the target week rather than
   * used to route the row elsewhere (see commitRosterImport in commands.ts):
   * a file with a "Semaine" column is more often someone re-using last
   * week's export than someone deliberately mixing weeks in one file, so a
   * mismatch is reported as an error instead of silently trusted. */
  weekLabel: string;
}

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

type FieldKey = "firstName" | "lastName" | "activityName" | "weekLabel";

const COLUMN_VARIANTS: Record<FieldKey, string[]> = {
  firstName: ["prenom", "prenoms", "prenom(s)", "first name", "firstname"],
  lastName: ["nom", "noms", "last name", "lastname", "nom de famille", "surname"],
  activityName: ["activite", "activites", "activity"],
  weekLabel: ["semaine", "week", "semaine du"],
};

const REQUIRED_FIELDS: FieldKey[] = ["firstName", "lastName", "activityName"];
const FIELD_LABELS: Record<FieldKey, string> = {
  firstName: "Prénom",
  lastName: "Nom",
  activityName: "Activité",
  weekLabel: "Semaine",
};

function matchHeaderField(headerText: string): FieldKey | null {
  const normalized = normalize(headerText);
  for (const [field, variants] of Object.entries(COLUMN_VARIANTS) as [FieldKey, string[]][]) {
    if (variants.includes(normalized)) return field;
  }
  return null;
}

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
      `Colonne(s) obligatoire(s) introuvable(s) : ${missing.map((f) => FIELD_LABELS[f]).join(", ")}. Colonnes attendues : Prénom, Nom, Activité (Semaine facultative).`,
    );
  }

  return map;
}

export function parseRosterSheetRows(sheet: ExcelJS.Worksheet): RawRosterImportRow[] {
  const headerRow = sheet.getRow(1);
  const columnMap = resolveColumnMap(headerRow);

  const get = (row: ExcelJS.Row, field: FieldKey): string => {
    const col = columnMap.get(field);
    return col ? cellText(row.getCell(col).value) : "";
  };

  const rows: RawRosterImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    if (rowNumber === 1) return;
    rows.push({
      row: rowNumber,
      firstName: get(row, "firstName"),
      lastName: get(row, "lastName"),
      activityName: get(row, "activityName"),
      weekLabel: get(row, "weekLabel"),
    });
  });

  if (rows.length > ROSTER_MAX_IMPORT_ROWS) {
    throw new ImportFileError(`Trop de lignes (max ${ROSTER_MAX_IMPORT_ROWS}).`);
  }
  if (rows.length === 0) {
    throw new ImportFileError("Le fichier ne contient aucune ligne de données.");
  }

  return rows;
}
