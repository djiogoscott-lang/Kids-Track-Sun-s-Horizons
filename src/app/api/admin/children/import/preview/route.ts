import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getActivitiesList, getChildrenList } from "@/server/data-source";
import {
  ImportFileError,
  MultipleSheetsError,
  loadWorkbook,
  parseSheetRows,
  selectSheet,
  validateImportRows,
} from "@/features/presence/application/excel-import";

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

  const buffer = Buffer.from(await file.arrayBuffer());

  let rawRows;
  let usedSheetName: string;
  try {
    const workbook = await loadWorkbook(file.name, buffer);
    const sheet = selectSheet(workbook, typeof sheetName === "string" && sheetName ? sheetName : undefined);
    usedSheetName = sheet.name;
    rawRows = parseSheetRows(sheet);
  } catch (error) {
    if (error instanceof MultipleSheetsError) {
      return NextResponse.json({ multipleSheets: true, sheetNames: error.sheetNames }, { status: 200 });
    }
    if (error instanceof ImportFileError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }

  const [activities, existingChildren] = await Promise.all([getActivitiesList(), getChildrenList()]);
  const results = validateImportRows(rawRows, activities, existingChildren);

  const summary = {
    total: results.length,
    valid: results.filter((r) => r.status === "valid").length,
    duplicates: results.filter((r) => r.status === "duplicate").length,
    errors: results.filter((r) => r.status === "error").length,
  };

  return NextResponse.json({ summary, results, sheetName: usedSheetName });
}
