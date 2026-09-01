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
  schoolClass: string;
  phone: string;
  email: string;
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
  school_class: string;
  phone: string;
  email: string;
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
    schoolClass: row.school_class ?? "",
    phone: row.phone ?? "",
    email: row.email ?? "",
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
      // Written here too, not only in bulkCreateChildren: NewSupabaseChildInput
      // has always declared these, but the single insert dropped them, so a
      // child added by hand lost their class and birth date silently.
      school_class: input.schoolClass ?? "",
      birth_date: input.birthDate ?? null,
      phone: input.phone ?? "",
      email: input.email ?? "",
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

export type SupabaseChildUpdate = Partial<
  Pick<SupabaseChild, "firstName" | "lastName" | "activityId" | "daycareAuto" | "notes" | "active" | "schoolClass" | "phone" | "email"> & {
    /** "" clears the date; undefined leaves it untouched. */
    birthDate: string;
  }
>;

export async function updateChild(childId: string, update: SupabaseChildUpdate): Promise<SupabaseChild | null> {
  const supabase = getServiceRoleClient();
  const patch: Partial<ChildRow> = {};
  if (update.firstName !== undefined) patch.first_name = update.firstName;
  if (update.lastName !== undefined) patch.last_name = update.lastName;
  if (update.activityId !== undefined) patch.activity_id = update.activityId;
  if (update.daycareAuto !== undefined) patch.daycare_auto = update.daycareAuto;
  if (update.notes !== undefined) patch.notes = update.notes;
  if (update.active !== undefined) patch.active = update.active;
  if (update.schoolClass !== undefined) patch.school_class = update.schoolClass;
  if (update.phone !== undefined) patch.phone = update.phone;
  if (update.email !== undefined) patch.email = update.email;
  // Only touched when the caller says so, and an empty string means "no date"
  // rather than the literal "" Postgres would reject for a date column.
  if (update.birthDate !== undefined) patch.birth_date = update.birthDate === "" ? null : update.birthDate;

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
 * RESTRICT, so any attendance row at all would block the delete.
 *
 * A child can hold a row where arrived and departed are both false without
 * anything having happened to them today — a monitor who marks a child
 * absent and then undoes it leaves exactly that. Relying on the raw FK error
 * would refuse to delete them, which is not "has history". Real history is a
 * row where the child actually arrived or departed at least once; only those
 * block deletion. Rows with neither are removed as part of this operation.
 *
 * Note this is NOT a placeholder-seeding scheme: creating a child writes no
 * attendance row at all, deliberately, because "no row for (child, date)" is
 * what distinguishes NOT_MARKED from an explicit absence (see morningStatus
 * in domain/types.ts and createChild in commands.ts).
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
