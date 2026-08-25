import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";

export interface SupabaseChild {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  active: boolean;
  notes: string;
}

interface ChildRow {
  id: string;
  first_name: string;
  last_name: string;
  activity_id: string;
  daycare_auto: boolean;
  active: boolean;
  notes: string;
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
    })
    .select("*")
    .single();
  if (error) throw error;
  return mapRow(data);
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
