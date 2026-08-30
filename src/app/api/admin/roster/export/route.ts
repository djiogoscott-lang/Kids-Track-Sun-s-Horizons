import { getCurrentUser } from "@/lib/auth/session";
import { getRosterForWeekView } from "@/features/presence/application/queries";
import { buildRosterExportWorkbook } from "@/features/presence/application/excel-workbook";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const weekStart = searchParams.get("weekStart");
  if (!weekStart) {
    return new Response("weekStart requis", { status: 400 });
  }

  const roster = await getRosterForWeekView(weekStart);
  const buffer = await buildRosterExportWorkbook(weekStart, roster);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="roster-semaine-${weekStart}.xlsx"`,
    },
  });
}
