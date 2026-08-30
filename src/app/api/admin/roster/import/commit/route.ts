import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { commitRosterImport, type RosterImportRow } from "@/features/presence/application/commands";
import { ROSTER_MAX_IMPORT_ROWS } from "@/features/presence/application/roster-import";

interface CommitBody {
  rows: RosterImportRow[];
  weekStart: string;
  createUnknownChildren: boolean;
}

function isRosterImportRow(value: unknown): value is RosterImportRow {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return typeof v.firstName === "string" && typeof v.lastName === "string" && typeof v.activityName === "string";
}

/**
 * Re-derives everything from the raw {firstName, lastName, activityName}
 * strings via commitRosterImport -> previewRosterImport server-side — never
 * trusts a client-resolved childId/activityId, so a tampered request can at
 * worst name a row that then fails to match anything, never write to an
 * arbitrary id.
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
  if (body.rows.length > ROSTER_MAX_IMPORT_ROWS) {
    return NextResponse.json({ error: `Trop de lignes (max ${ROSTER_MAX_IMPORT_ROWS}).` }, { status: 400 });
  }
  if (typeof body.weekStart !== "string" || !body.weekStart) {
    return NextResponse.json({ error: "Semaine cible manquante." }, { status: 400 });
  }
  if (!body.rows.every(isRosterImportRow)) {
    return NextResponse.json({ error: "Import annulé : une ligne est invalide ou a été altérée." }, { status: 400 });
  }

  try {
    const result = await commitRosterImport(body.rows, body.weekStart, Boolean(body.createUnknownChildren), user.id);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error("Roster import commit failed, nothing was written:", error);
    return NextResponse.json({ error: "Import annulé : aucune modification effectuée." }, { status: 500 });
  }
}
