import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";

export interface SupabaseActivity {
  id: string;
  name: string;
  monitorId: string | null;
}

export async function getActivities(): Promise<SupabaseActivity[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("activities")
    .select("id, name, monitor_id")
    .eq("organization_id", ORGANIZATION_ID)
    .order("name");
  if (error) throw error;
  return data.map((a) => ({ id: a.id, name: a.name, monitorId: a.monitor_id }));
}

export interface SupabaseMonitor {
  id: string;
  name: string;
}

export async function getMonitors(): Promise<SupabaseMonitor[]> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase
    .from("organization_memberships")
    .select("user_id, profiles(full_name)")
    .eq("organization_id", ORGANIZATION_ID)
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
    .eq("organization_id", ORGANIZATION_ID);
  if (error) throw error;

  const target = activities.find((a) => a.id === activityId);
  const previousMonitorOfTarget = target?.monitor_id ?? null;
  const otherActivityWithThisMonitor = activities.find((a) => a.id !== activityId && a.monitor_id === monitorId);

  const { error: assignError } = await supabase
    .from("activities")
    .update({ monitor_id: monitorId })
    .eq("id", activityId)
    .eq("organization_id", ORGANIZATION_ID);
  if (assignError) throw assignError;

  if (otherActivityWithThisMonitor && previousMonitorOfTarget) {
    const { error: swapError } = await supabase
      .from("activities")
      .update({ monitor_id: previousMonitorOfTarget })
      .eq("id", otherActivityWithThisMonitor.id)
      .eq("organization_id", ORGANIZATION_ID);
    if (swapError) throw swapError;
  }
}
