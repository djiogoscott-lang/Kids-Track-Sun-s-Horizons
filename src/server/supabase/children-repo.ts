import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";

export interface SupabaseChild {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  active: boolean;
  notes: string;
  isDemo: boolean;
  createdAt: Date;
}

interface ChildRow {
  id: string;
  first_name: string;
  last_name: string;
  activity_id: string;
  daycare_auto: boolean;
  active: boolean;
  notes: string;
  is_demo: boolean;
  created_at: string;
}

function mapRow(row: ChildRow): SupabaseChild {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    activityId: row.activity_id,
    daycareAuto: row.daycare_auto,
    active: row.active,
    notes: row.notes,
    isDemo: row.is_demo,
    createdAt: new Date(row.created_at),
  };
}

export async function getChildren(): Promise<SupabaseChild[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("children").select("*").eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;
  return data.map(mapRow);
}

export async function getChild(childId: string): Promise<SupabaseChild | undefined> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("id", childId)
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : undefined;
}

export interface NewSupabaseChildInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
  isDemo?: boolean;
}

export async function createChild(input: NewSupabaseChildInput): Promise<SupabaseChild> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("children")
    .insert({
      organization_id: ORGANIZATION_ID,
      first_name: input.firstName,
      last_name: input.lastName,
      activity_id: input.activityId,
      daycare_auto: input.daycareAuto,
      notes: input.notes,
      is_demo: input.isDemo ?? false,
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
}

/**
 * A single multi-row INSERT is atomic in Postgres: if any row violates a
 * constraint, none of them are written — this is what makes the Excel import
 * "all or nothing" without needing a bespoke transaction/RPC.
 */
export async function bulkCreateChildren(inputs: NewSupabaseChildInput[]): Promise<SupabaseChild[]> {
  if (inputs.length === 0) return [];
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("children")
    .insert(
      inputs.map((input) => ({
        organization_id: ORGANIZATION_ID,
        first_name: input.firstName,
        last_name: input.lastName,
        activity_id: input.activityId,
        daycare_auto: input.daycareAuto,
        notes: input.notes,
        is_demo: input.isDemo ?? false,
      })),
    )
    .select("*");
  if (error) throw error;
  return data.map(mapRow);
}

export type SupabaseChildUpdate = Partial<Pick<SupabaseChild, "firstName" | "lastName" | "activityId" | "daycareAuto" | "notes" | "active">>;

export async function updateChild(childId: string, update: SupabaseChildUpdate): Promise<SupabaseChild | null> {
  const supabase = getServiceRoleClient();
  const patch: Partial<ChildRow> = {};
  if (update.firstName !== undefined) patch.first_name = update.firstName;
  if (update.lastName !== undefined) patch.last_name = update.lastName;
  if (update.activityId !== undefined) patch.activity_id = update.activityId;
  if (update.daycareAuto !== undefined) patch.daycare_auto = update.daycareAuto;
  if (update.notes !== undefined) patch.notes = update.notes;
  if (update.active !== undefined) patch.active = update.active;

  const { data, error } = await supabase
    .from("children")
    .update(patch)
    .eq("organization_id", ORGANIZATION_ID)
    .eq("id", childId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export class ChildHasHistoryError extends Error {}

/**
 * Physical deletion, not deactivation. attendance.child_id is ON DELETE
 * RESTRICT, but every child gets an empty placeholder attendance row the
 * moment they're created (see createChild() in commands.ts) — arrived and
 * departed both false, nothing ever actually happened. Relying on the raw
 * FK error would block deletion of every child ever added normally, which
 * is not "has history", it's "exists". Real history is a row where the
 * child actually arrived or departed at least once; only those block
 * deletion. Empty placeholder rows are deleted as part of this operation —
 * they carry no information worth protecting.
 */
export async function deleteChildPermanently(childId: string): Promise<void> {
  const supabase = getServiceRoleClient();

  const { data: attendanceRows, error: attendanceError } = await supabase
    .from("attendance")
    .select("id, arrived, departed")
    .eq("organization_id", ORGANIZATION_ID)
    .eq("child_id", childId);
  if (attendanceError) throw attendanceError;

  const hasRealHistory = (attendanceRows ?? []).some((row) => row.arrived || row.departed);
  if (hasRealHistory) {
    throw new ChildHasHistoryError(
      "Impossible de supprimer : cet enfant a un historique de présence. Utilisez plutôt Désactiver pour le retirer sans perdre l'historique.",
    );
  }

  if (attendanceRows && attendanceRows.length > 0) {
    const { error: cleanupError } = await supabase
      .from("attendance")
      .delete()
      .eq("organization_id", ORGANIZATION_ID)
      .eq("child_id", childId);
    if (cleanupError) throw cleanupError;
  }

  const { error } = await supabase.from("children").delete().eq("organization_id", ORGANIZATION_ID).eq("id", childId);
  if (error) {
    if (error.code === "23503") {
      throw new ChildHasHistoryError(
        "Impossible de supprimer : cet enfant a un historique de présence. Utilisez plutôt Désactiver pour le retirer sans perdre l'historique.",
      );
    }
    throw error;
  }
}
