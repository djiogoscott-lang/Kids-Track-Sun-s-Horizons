import type ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getActivitiesList } from "@/server/data-source";
import { previewRosterImport, type RosterImportRow } from "@/features/presence/application/commands";
import { ImportFileError, loadWorkbook } from "@/features/presence/application/excel-import";
import {
  autoColumnMapping,
  detectHeaderRow,
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
  // Admin-accepted corrections for a "Nom complet" row split into
  // firstName/lastName — same contract as activityOverrides: only ever
  // applied when the admin explicitly accepted a suggestion (AI-assisted or
  // typed by hand), never inferred silently here.
  let nameOverrides: Record<string, { firstName: string; lastName: string }> = {};
  const nameOverridesRaw = formData.get("nameOverrides");
  if (typeof nameOverridesRaw === "string" && nameOverridesRaw) {
    try {
      nameOverrides = JSON.parse(nameOverridesRaw);
    } catch {
      return NextResponse.json({ error: "Corrections de nom invalides." }, { status: 400 });
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

  // Real workbooks ship with a pile of empty "Feuil5…Feuil16" tabs Excel
  // leaves behind. Offering those as choices makes the secretary pick the
  // right one out of thirteen, twelve of which hold nothing — so only sheets
  // that actually contain rows are ever considered.
  const populatedSheets = workbook.worksheets.filter((s) => s.actualRowCount > 0);
  const candidateSheets = populatedSheets.length > 0 ? populatedSheets : workbook.worksheets;

  let selectedSheets: ExcelJS.Worksheet[];
  if (importAllSheets) {
    selectedSheets = candidateSheets;
  } else if (candidateSheets.length === 1) {
    selectedSheets = candidateSheets;
  } else if (requestedSheetName) {
    const sheet = workbook.getWorksheet(requestedSheetName);
    if (!sheet) return NextResponse.json({ error: `Feuille "${requestedSheetName}" introuvable.` }, { status: 400 });
    selectedSheets = [sheet];
  } else {
    return NextResponse.json({ multipleSheets: true, sheetNames: candidateSheets.map((s) => s.name) });
  }

  const activities = await getActivitiesList();
  const activityNamesLower = new Map(activities.map((a) => [a.name.toLowerCase(), a.name]));

  // An explicit target activity, chosen by the admin for the whole file.
  // Resolved against THIS school's activities only, so an id from another
  // school resolves to nothing rather than being trusted.
  const targetActivityIdField = formData.get("targetActivityId");
  const targetActivityId = typeof targetActivityIdField === "string" && targetActivityIdField ? targetActivityIdField : null;
  const targetActivity = targetActivityId ? (activities.find((a) => a.id === targetActivityId) ?? null) : null;
  if (targetActivityId && !targetActivity) {
    return NextResponse.json({ error: "Activité cible introuvable dans cette école." }, { status: 400 });
  }
  // Caught here rather than per row: a deactivated target makes every single
  // row fail identically, and one clear sentence up front is far more useful
  // than sixty copies of the same error in the preview table.
  if (targetActivity && !targetActivity.active) {
    return NextResponse.json(
      { error: `L'activité "${targetActivity.name}" est désactivée. Réactivez-la dans Gestion activités avant d'y importer une liste.` },
      { status: 400 },
    );
  }

  // Column mapping is resolved once, against the first sheet actually being
  // read — every selected sheet is expected to share the same header shape
  // (the common real-world case for a one-tab-per-activity workbook).
  const representativeHeaderRow = detectHeaderRow(selectedSheets[0]);
  const representativeHeaders = representativeHeaderRow.headers;
  const effectiveMapping = columnMapping ?? autoColumnMapping(representativeHeaders);
  // Activité is optional when the admin named a target activity for the file,
  // or when EVERY selected sheet's own name doubles as its activity.
  // Otherwise at least one row could not resolve an activity at all, and the
  // admin needs to see that rather than have it guessed.
  const everySheetNameIsAnActivity = selectedSheets.every((s) => activityNamesLower.has(s.name.toLowerCase()));
  const activityNameOptional = Boolean(targetActivity) || everySheetNameIsAnActivity;
  if (!isColumnMappingComplete(representativeHeaders, effectiveMapping, activityNameOptional)) {
    return NextResponse.json({
      needsColumnMapping: true,
      headers: representativeHeaders,
      sheetName: selectedSheets[0].name,
      headerRowNumber: representativeHeaderRow.rowNumber,
    });
  }

  let rawRows;
  try {
    rawRows = selectedSheets.flatMap((sheet) => {
      const activityFallback = activityNamesLower.get(sheet.name.toLowerCase()) ?? null;
      return parseSheetRowsWithMapping(sheet, effectiveMapping, {
        targetActivityName: targetActivity?.name ?? null,
        sheetActivityFallback: activityFallback,
        headerRowNumber: sheet === selectedSheets[0] ? representativeHeaderRow.rowNumber : undefined,
      });
    });
  } catch (error) {
    if (error instanceof ImportFileError) return NextResponse.json({ error: error.message }, { status: 400 });
    throw error;
  }

  const rows: RosterImportRow[] = rawRows.map((r) => {
    const nameOverride = nameOverrides[rowKey(r.sheetName, r.row)];
    return {
      row: r.row,
      sheetName: r.sheetName,
      firstName: nameOverride?.firstName ?? r.firstName,
      lastName: nameOverride?.lastName ?? r.lastName,
      fullName: r.fullName,
      activityName: r.activityName,
      garderie: r.garderie,
      notes: r.notes,
      schoolClass: r.schoolClass,
      birthDate: r.birthDate,
      phone: r.phone,
      email: r.email,
      activityOverride: activityOverrides[rowKey(r.sheetName, r.row)],
    };
  });

  const { outcomes, summary } = await previewRosterImport(rows, weekStart);

  return NextResponse.json({ summary, outcomes, sheetNames: selectedSheets.map((s) => s.name) });
}
