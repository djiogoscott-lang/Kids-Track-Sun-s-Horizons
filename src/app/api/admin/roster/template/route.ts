import { getCurrentUser } from "@/lib/auth/session";
import { buildRosterTemplateWorkbook } from "@/features/presence/application/excel-workbook";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new Response("Unauthorized", { status: 401 });
  }

  const buffer = await buildRosterTemplateWorkbook();
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="modele-import-roster.xlsx"',
    },
  });
}
