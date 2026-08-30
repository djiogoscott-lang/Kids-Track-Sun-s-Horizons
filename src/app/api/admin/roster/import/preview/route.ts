import type ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getActivitiesList } from "@/server/data-source";
import { previewRosterImport, type RosterImportRow } from "@/features/presence/application/commands";
import { ImportFileError, loadWorkbook } from "@/features/presence/application/excel-import";
import {
  autoColumnMapping,
  detectHeaders,
  isColumnMappingComplete,
  parseSheetRowsWithMapping,
  type ColumnMapping,
} from "@/features/presence/application/roster-import";

function rowKey(sheetName: string, row: number): string {
  return `${sheetName}:${row}`;
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Aucun fichier reçu." }, { status: 400 });
  }
  const weekStart = formData.get("weekStart");
  if (typeof weekStart !== "string" || !weekStart) {
    return NextResponse.json({ error: "Semaine cible manquante." }, { status: 400 });
  }
  const sheetNameField = formData.get("sheetName");
  const requestedSheetName = typeof sheetNameField === "string" && sheetNameField ? sheetNameField : undefined;
  const importAllSheets = formData.get("importAllSheets") === "true";

  let columnMapping: ColumnMapping | null = null;
  const columnMappingRaw = formData.get("columnMapping");
  if (typeof columnMappingRaw === "string" && columnMappingRaw) {
    try {
      columnMapping = JSON.parse(columnMappingRaw);
    } catch {
      return NextResponse.json({ error: "Correspondance de colonnes invalide." }, { status: 400 });
    }
  }
  let activityOverrides: Record<string, string> = {};
  const activityOverridesRaw = formData.get("activityOverrides");
  if (typeof activityOverridesRaw === "string" && activityOverridesRaw) {
    try {
      activityOverrides = JSON.parse(activityOverridesRaw);
    } catch {
      return NextResponse.json({ error: "Corrections d'activité invalides." }, { status: 400 });
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let workbook: ExcelJS.Workbook;
  try {
    workbook = await loadWorkbook(file.name, buffer);
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  let selectedSheets: ExcelJS.Worksheet[];
  if (importAllSheets) {
    selectedSheets = workbook.worksheets;
  } else if (workbook.worksheets.length === 1) {
    selectedSheets = workbook.worksheets;
  } else if (requestedSheetName) {
    const sheet = workbook.getWorksheet(requestedSheetName);
    if (!sheet) return NextResponse.json({ error: `Feuille "${requestedSheetName}" introuvable.` }, { status: 400 });
    selectedSheets = [sheet];
  } else {
    return NextResponse.json({ multipleSheets: true, sheetNames: workbook.worksheets.map((s) => s.name) });
  }

  const activities = await getActivitiesList();
  const activityNamesLower = new Map(activities.map((a) => [a.name.toLowerCase(), a.name]));

  // Column mapping is resolved once, against the first sheet actually being
  // read — every selected sheet is expected to share the same header shape
  // (the common real-world case for a one-tab-per-activity workbook).
  const representativeHeaders = detectHeaders(selectedSheets[0]);
  const effectiveMapping = columnMapping ?? autoColumnMapping(representativeHeaders);
  // Activité is only optional when EVERY selected sheet's own name doubles
  // as its activity — otherwise at least one row would have no way to
  // resolve an activity at all, and the admin needs to see that.
  const everySheetNameIsAnActivity = selectedSheets.every((s) => activityNamesLower.has(s.name.toLowerCase()));
  if (!isColumnMappingComplete(representativeHeaders, effectiveMapping, everySheetNameIsAnActivity)) {
    return NextResponse.json({ needsColumnMapping: true, headers: representativeHeaders, sheetName: selectedSheets[0].name });
  }

  let rawRows;
  try {
    rawRows = selectedSheets.flatMap((sheet) => {
      const activityFallback = activityNamesLower.get(sheet.name.toLowerCase()) ?? null;
      return parseSheetRowsWithMapping(sheet, effectiveMapping, activityFallback);
    });
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const rows: RosterImportRow[] = rawRows.map((r) => ({
    row: r.row,
    sheetName: r.sheetName,
    firstName: r.firstName,
    lastName: r.lastName,
    activityName: r.activityName,
    garderie: r.garderie,
    notes: r.notes,
    activityOverride: activityOverrides[rowKey(r.sheetName, r.row)],
  }));

  const { outcomes, summary } = await previewRosterImport(rows, weekStart);

  return NextResponse.json({ summary, outcomes, sheetNames: selectedSheets.map((s) => s.name) });
}
