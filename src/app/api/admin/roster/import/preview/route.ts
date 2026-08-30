import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { previewRosterImport } from "@/features/presence/application/commands";
import { ImportFileError, MultipleSheetsError, loadWorkbook, selectSheet } from "@/features/presence/application/excel-import";
import { parseRosterSheetRows } from "@/features/presence/application/roster-import";

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
  const sheetName = formData.get("sheetName");
  const weekStart = formData.get("weekStart");
  if (typeof weekStart !== "string" || !weekStart) {
    return NextResponse.json({ error: "Semaine cible manquante." }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());

  let rawRows;
  let usedSheetName: string;
  try {
    const workbook = await loadWorkbook(file.name, buffer);
    const sheet = selectSheet(workbook, typeof sheetName === "string" && sheetName ? sheetName : undefined);
    usedSheetName = sheet.name;
    rawRows = parseRosterSheetRows(sheet);
  } catch (error) {
    if (error instanceof MultipleSheetsError) {
      return NextResponse.json({ multipleSheets: true, sheetNames: error.sheetNames }, { status: 200 });
    }
    if (error instanceof ImportFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const results = await previewRosterImport(
    rawRows.map((r) => ({ firstName: r.firstName, lastName: r.lastName, activityName: r.activityName, weekLabel: r.weekLabel })),
    weekStart,
  );

  const summary = {
    total: results.length,
    matched: results.filter((r) => r.status === "MATCHED").length,
    unknownChildren: results.filter((r) => r.status === "UNKNOWN_CHILD").length,
    unknownActivities: results.filter((r) => r.status === "UNKNOWN_ACTIVITY").length,
    weekMismatches: results.filter((r) => r.status === "WEEK_MISMATCH").length,
    duplicates: results.filter((r) => r.status === "DUPLICATE").length,
  };

  return NextResponse.json({ summary, results, sheetName: usedSheetName });
}
