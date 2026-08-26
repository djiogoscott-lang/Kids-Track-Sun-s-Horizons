import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { bulkCreateChildRecords, getActivitiesList } from "@/server/data-source";
import { MAX_IMPORT_ROWS, type ValidatedChildInput } from "@/features/presence/application/excel-import";

interface CommitBody {
  rows: ValidatedChildInput[];
}

function isValidatedChildInput(value: unknown): value is ValidatedChildInput {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.firstName === "string" &&
    v.firstName.trim().length > 0 &&
    typeof v.lastName === "string" &&
    v.lastName.trim().length > 0 &&
    typeof v.activityId === "string" &&
    typeof v.daycareAuto === "boolean" &&
    typeof v.active === "boolean" &&
    typeof v.notes === "string" &&
    v.notes.length <= 2000
  );
}

/**
 * Re-validates every row from scratch rather than trusting what the client
 * echoes back from the preview step — the preview is a UX convenience, not
 * the security boundary. Activity IDs are re-checked against the current
 * roster in case anything changed between preview and confirm.
 */
export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: CommitBody;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
  }

  if (!Array.isArray(body.rows) || body.rows.length === 0) {
    return NextResponse.json({ error: "Aucune ligne à importer." }, { status: 400 });
  }
  if (body.rows.length > MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Trop de lignes (max ${MAX_IMPORT_ROWS}).` }, { status: 400 });
  }

  const activities = await getActivitiesList();
  const activityIds = new Set(activities.map((a) => a.id));

  const validated: ValidatedChildInput[] = [];
  for (const row of body.rows) {
    if (!isValidatedChildInput(row) || !activityIds.has(row.activityId)) {
      return NextResponse.json({ error: "Import annulé : une ligne est invalide ou a été altérée." }, { status: 400 });
    }
    validated.push(row);
  }

  try {
    const created = await bulkCreateChildRecords(
      validated.map((row) => ({
        firstName: row.firstName,
        lastName: row.lastName,
        activityId: row.activityId,
        daycareAuto: row.daycareAuto,
        notes: row.notes,
      })),
    );
    return NextResponse.json({ ok: true, count: created.length });
  } catch (error) {
    console.error("Excel import commit failed, nothing was written:", error);
    return NextResponse.json({ error: "Import annulé : aucune modification effectuée." }, { status: 500 });
  }
}
