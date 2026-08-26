import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";

export interface MonitorAdminRow {
  id: string;
  name: string;
  email: string | null;
  activityId: string | null;
  activityName: string | null;
  active: boolean;
}

/**
 * Unlike getMonitors() in activities-repo.ts (which only ever needs
 * currently-active monitors for assignment dropdowns), this deliberately
 * includes revoked ones too — the admin screen needs to see and reactivate
 * them, not just the active roster.
 */
export async function getMonitorsForAdmin(): Promise<MonitorAdminRow[]> {
  const supabase = getServiceRoleClient();
  const [membershipsResult, activitiesResult, usersResult] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("user_id, revoked_at, profiles!organization_memberships_user_id_fkey(full_name)")
      .eq("organization_id", ORGANIZATION_ID)
      .eq("role", "MONITOR"),
    supabase.from("activities").select("id, name, monitor_id").eq("organization_id", ORGANIZATION_ID),
    supabase.auth.admin.listUsers(),
  ]);
  if (membershipsResult.error) throw membershipsResult.error;
  if (activitiesResult.error) throw activitiesResult.error;
  if (usersResult.error) throw usersResult.error;

  const activities = activitiesResult.data;
  const authUsers = usersResult.data.users;

  return membershipsResult.data.map((m) => {
    const activity = activities.find((a) => a.monitor_id === m.user_id) ?? null;
    const authUser = authUsers.find((u) => u.id === m.user_id);
    return {
      id: m.user_id,
      name: (m.profiles as unknown as { full_name: string } | null)?.full_name ?? "Moniteur",
      email: authUser?.email ?? null,
      activityId: activity?.id ?? null,
      activityName: activity?.name ?? null,
      active: m.revoked_at === null,
    };
  });
}

/**
 * Toggles the same revoked_at/revoked_by columns that is_organization_admin()
 * and is_activity_monitor() already check — a deactivated monitor loses RLS
 * access AND getCurrentUser() treats their session as logged out (see
 * lib/auth/session.ts), with no separate "is this account active" flag to
 * keep in sync.
 */
export async function setMonitorActive(monitorId: string, active: boolean, actingAdminId: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase
    .from("organization_memberships")
    .update(
      active
        ? { revoked_at: null, revoked_by: null, revocation_reason: null }
        : { revoked_at: new Date().toISOString(), revoked_by: actingAdminId, revocation_reason: "Désactivé par l'administrateur" },
    )
    .eq("organization_id", ORGANIZATION_ID)
    .eq("user_id", monitorId)
    .eq("role", "MONITOR");
  if (error) throw error;
}
