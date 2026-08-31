import { getServiceRoleClient } from "@/lib/supabase/service";
import { requireActiveSchoolId } from "@/lib/schools/context";

export interface SupabaseActivity {
  id: string;
  name: string;
  description: string;
  monitorId: string | null;
  active: boolean;
}

export async function getActivities(): Promise<SupabaseActivity[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("activities")
    .select("id, name, description, monitor_id, active")
    .eq("organization_id", (await requireActiveSchoolId()))
    .order("name");
  if (error) throw error;
  return data.map((a) => ({ id: a.id, name: a.name, description: a.description ?? "", monitorId: a.monitor_id, active: a.active }));
}

export class ActivityHasDataError extends Error {}

export interface ActivityDependencyCounts {
  children: number;
  weeklyRoster: number;
  attendance: number;
  activityDayState: number;
  notifications: number;
}

/** Everything that would block a physical delete under the FK restrict
 * constraints, checked up front so the caller can decide (or tell the
 * admin) whether "supprimer" or "désactiver" is the right action, instead
 * of finding out from a raw 23503 after the fact. */
export async function getActivityDependencyCounts(activityId: string): Promise<ActivityDependencyCounts> {
  const supabase = getServiceRoleClient();
  const [children, weeklyRoster, attendance, activityDayState, notifications] = await Promise.all([
    supabase.from("children").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())).eq("activity_id", activityId),
    supabase.from("weekly_roster").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())).eq("activity_id", activityId),
    supabase.from("attendance").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())).eq("activity_id", activityId),
    supabase.from("activity_day_state").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())).eq("activity_id", activityId),
    supabase.from("notifications").select("id", { count: "exact", head: true }).eq("organization_id", (await requireActiveSchoolId())).eq("activity_id", activityId),
  ]);
  for (const r of [children, weeklyRoster, attendance, activityDayState, notifications]) {
    if (r.error) throw r.error;
  }
  return {
    children: children.count ?? 0,
    weeklyRoster: weeklyRoster.count ?? 0,
    attendance: attendance.count ?? 0,
    activityDayState: activityDayState.count ?? 0,
    notifications: notifications.count ?? 0,
  };
}

export interface NewActivityInput {
  name: string;
  description: string;
  monitorId: string | null;
  active: boolean;
}

export async function createActivity(input: NewActivityInput): Promise<SupabaseActivity> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("activities")
    .insert({
      organization_id: (await requireActiveSchoolId()),
      name: input.name,
      description: input.description,
      monitor_id: input.monitorId,
      active: input.active,
    })
    .select("id, name, description, monitor_id, active")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, description: data.description ?? "", monitorId: data.monitor_id, active: data.active };
}

export type ActivityUpdate = Partial<Pick<NewActivityInput, "name" | "description" | "active">>;

export async function updateActivity(activityId: string, update: ActivityUpdate): Promise<SupabaseActivity> {
  const supabase = getServiceRoleClient();
  const patch: Record<string, unknown> = {};
  if (update.name !== undefined) patch.name = update.name;
  if (update.description !== undefined) patch.description = update.description;
  if (update.active !== undefined) patch.active = update.active;

  const { data, error } = await supabase
    .from("activities")
    .update(patch)
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("id", activityId)
    .select("id, name, description, monitor_id, active")
    .single();
  if (error) throw error;
  return { id: data.id, name: data.name, description: data.description ?? "", monitorId: data.monitor_id, active: data.active };
}

/** Unassigns whichever monitor currently holds this activity, if any —
 * the inverse of setActivityMonitor, with no swap side effect needed since
 * removing is never ambiguous the way assigning-while-already-held is. */
export async function removeActivityMonitor(activityId: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("activities")
    .update({ monitor_id: null })
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("id", activityId);
  if (error) throw error;
}

/**
 * Physical deletion only when every FK-restrict dependency is actually
 * empty (children, weekly_roster, attendance, activity_day_state,
 * notifications) — otherwise throws so the caller can offer "désactiver"
 * instead, matching deleteChildPermanently's same has-real-data philosophy.
 */
export async function deleteActivity(activityId: string): Promise<void> {
  const counts = await getActivityDependencyCounts(activityId);
  const total = counts.children + counts.weeklyRoster + counts.attendance + counts.activityDayState + counts.notifications;
  if (total > 0) {
    throw new ActivityHasDataError(
      "Impossible de supprimer : cette activité possède des données (enfants, roster, présences, historique ou notifications). Utilisez plutôt Désactiver.",
    );
  }
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("activities").delete().eq("organization_id", (await requireActiveSchoolId())).eq("id", activityId);
  if (error) throw error;
}

export interface SupabaseMonitor {
  id: string;
  name: string;
}

export async function getMonitors(): Promise<SupabaseMonitor[]> {
  const supabase = getServiceRoleClient();
  // organization_memberships has three foreign keys into profiles (user_id,
  // created_by, revoked_by), so the embed must name which one — PostgREST
  // otherwise refuses the query outright (PGRST201) rather than guessing.
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("user_id, profiles!organization_memberships_user_id_fkey(full_name)")
    .eq("organization_id", (await requireActiveSchoolId()))
    .eq("role", "MONITOR")
    .is("revoked_at", null);
  if (error) throw error;
  return data.map((m) => ({
    id: m.user_id,
    name: (m.profiles as unknown as { full_name: string } | null)?.full_name ?? "Moniteur",
  }));
}

/**
 * Mirrors the demo store's swap-on-reassignment rule: an activity's new
 * monitor is unassigned from whatever activity they previously held, so no
 * monitor ever ends up on two activities at once.
 */
export async function setActivityMonitor(activityId: string, monitorId: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { data: activities, error } = await supabase
    .from("activities")
    .select("id, monitor_id")
    .eq("organization_id", (await requireActiveSchoolId()));
  if (error) throw error;

  const target = activities.find((a) => a.id === activityId);
  const previousMonitorOfTarget = target?.monitor_id ?? null;
  const otherActivityWithThisMonitor = activities.find((a) => a.id !== activityId && a.monitor_id === monitorId);

  const { error: assignError } = await supabase
    .from("activities")
    .update({ monitor_id: monitorId })
    .eq("id", activityId)
    .eq("organization_id", (await requireActiveSchoolId()));
  if (assignError) throw assignError;

  if (otherActivityWithThisMonitor && previousMonitorOfTarget) {
    const { error: swapError } = await supabase
      .from("activities")
      .update({ monitor_id: previousMonitorOfTarget })
      .eq("id", otherActivityWithThisMonitor.id)
      .eq("organization_id", (await requireActiveSchoolId()));
    if (swapError) throw swapError;
  }
}
