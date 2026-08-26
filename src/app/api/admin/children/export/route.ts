import { getCurrentUser } from "@/lib/auth/session";
import { listChildrenForAdmin } from "@/features/presence/application/queries";
import { buildExportWorkbook } from "@/features/presence/application/excel-workbook";

export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new Response("Unauthorized", { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const activityId = searchParams.get("activity");
  const activeOnly = searchParams.get("activeOnly") === "true";

  let children = await listChildrenForAdmin();
  if (activityId) children = children.filter((c) => c.activityId === activityId);
  if (activeOnly) children = children.filter((c) => c.active);

  const buffer = await buildExportWorkbook(children);
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="enfants-export.xlsx"',
    },
  });
}
