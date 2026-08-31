import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireActiveSchoolId } from "@/lib/schools/context";

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
  /** ISO date or "" — see ChildRecord.birthDate. */
  birthDate: string;
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
  birth_date: string | null;
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
    // A `date` column comes back as "YYYY-MM-DD"; sliced rather than parsed
    // through Date so a birth date can never shift a day across a timezone.
    birthDate: row.birth_date ? String(row.birth_date).slice(0, 10) : "",
  };
}

export async function getChildren(): Promise<SupabaseChild[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.from("children").select("*").eq("organization_id", (await requireActiveSchoolId()));
  if (error) throw error;
  return data.map(mapRow);
}

export async function getChild(childId: string): Promise<SupabaseChild | undefined> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("children")
    .select("*")
    .eq("organization_id", (await requireActiveSchoolId()))
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
  /** Profile details carried by real school lists. All optional: a child
   * created by hand from the app only needs a name and an activity. */
  schoolClass?: string;
  birthDate?: string | null; // ISO (YYYY-MM-DD)
  phone?: string;
  email?: string;
}

export async function createChild(input: NewSupabaseChildInput): Promise<SupabaseChild> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("children")
    .insert({
      organization_id: (await requireActiveSchoolId()),
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
  const schoolId = await requireActiveSchoolId();
  const { data, error } = await supabase
    .from("children")
    .insert(
      inputs.map((input) => ({
        organization_id: schoolId,
        first_name: input.firstName,
        last_name: input.lastName,
        activity_id: input.activityId,
        daycare_auto: input.daycareAuto,
        notes: input.notes,
        is_demo: input.isDemo ?? false,
        school_class: input.schoolClass ?? "",
        birth_date: input.birthDate ?? null,
        phone: input.phone ?? "",
        email: input.email ?? "",
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
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("id", childId)
    .select("*")
    .maybeSingle();
  if (error) throw error;
  return data ? mapRow(data) : null;
}

export class ChildHasHistoryError extends Error {}

export interface BulkDeleteBlocked {
  id: string;
  firstName: string;
  lastName: string;
  reason: "HISTORY" | "ROSTER";
}

export interface BulkDeleteOutcome {
  deletedIds: string[];
  blocked: BulkDeleteBlocked[];
}

/**
 * A single Postgres function call, not a loop of individual deletes: every
 * id's eligibility (no real attendance history, no weekly_roster reference)
 * is computed once and both cleanup deletes happen inside that same function
 * invocation's transaction. This is what makes it both O(1) round trips
 * regardless of how many ids are selected, and race-free — unlike a
 * check-then-delete loop from this layer, nothing can write a real
 * attendance row for a targeted child in the gap between the check and the
 * delete, because there is no gap visible outside the single statement.
 */
export async function bulkDeleteChildrenPermanently(childIds: string[]): Promise<BulkDeleteOutcome> {
  if (childIds.length === 0) return { deletedIds: [], blocked: [] };
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.rpc("bulk_delete_children", {
    p_organization_id: (await requireActiveSchoolId()),
    p_child_ids: childIds,
  });
  if (error) throw error;
  const result = data as { deletedIds: string[]; blocked: BulkDeleteBlocked[] };
  return { deletedIds: result.deletedIds ?? [], blocked: result.blocked ?? [] };
}

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
    .eq("organization_id", (await requireActiveSchoolId()))
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
      .eq("organization_id", (await requireActiveSchoolId()))
      .eq("child_id", childId);
    if (cleanupError) throw cleanupError;
  }

  const { error } = await supabase.from("children").delete().eq("organization_id", (await requireActiveSchoolId())).eq("id", childId);
  if (error) {
    if (error.code === "23503") {
      // Real attendance history was already ruled out above (and any
      // history-free placeholder rows were just cleaned up), so the only
      // remaining restrict FK that can fire here is weekly_roster — the
      // child still has an active roster entry for some week. Reported
      // accurately rather than reusing the "historique de présence" message,
      // which would mislead the admin into looking in the wrong place.
      if (error.message?.includes("weekly_roster")) {
        throw new ChildHasHistoryError(
          "Impossible de supprimer : cet enfant est encore inscrit au roster d'une semaine. Retirez-le du roster (Participants de la semaine) avant de le supprimer, ou utilisez Désactiver.",
        );
      }
      throw new ChildHasHistoryError(
        "Impossible de supprimer : cet enfant a un historique de présence. Utilisez plutôt Désactiver pour le retirer sans perdre l'historique.",
      );
    }
    throw error;
  }
}
