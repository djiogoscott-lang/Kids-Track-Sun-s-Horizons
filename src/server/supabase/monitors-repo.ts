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

export async function isEmailAlreadyUsed(email: string): Promise<boolean> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  const target = email.trim().toLowerCase();
  return data.users.some((u) => u.email?.toLowerCase() === target);
}

export type AccountRole = "ADMIN" | "MONITOR";

/**
 * Creates the account with the password the admin chose — no invitation
 * email, no user-set-their-own-password step. admin.createUser() is the
 * server-only Supabase Auth admin API for exactly this; the password is
 * handed to Supabase directly and never touches any table this app owns
 * (profiles/organization_memberships/children), never logged, and never
 * echoed back in the response. The full_name reaches public.profiles
 * automatically via the on_auth_user_created trigger (see the foundation
 * migration) — inserting it a second time here would just race that trigger.
 *
 * Rolls back the just-created Auth user if the membership insert or
 * activity assignment fails, so a failure never leaves a half-configured
 * account with no way to recover it from the UI.
 */
export async function createAccountWithPassword(
  email: string,
  password: string,
  fullName: string,
  role: AccountRole,
  activityId: string | null,
): Promise<string> {
  const supabase = getServiceRoleClient();
  const { data, error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw error;
  const userId = data.user.id;

  const { error: membershipError } = await supabase
    .from("organization_memberships")
    .insert({ organization_id: ORGANIZATION_ID, user_id: userId, role });
  if (membershipError) {
    await supabase.auth.admin.deleteUser(userId);
    throw membershipError;
  }

  if (activityId) {
    const { error: activityError } = await supabase
      .from("activities")
      .update({ monitor_id: userId })
      .eq("id", activityId)
      .eq("organization_id", ORGANIZATION_ID);
    if (activityError) {
      await supabase.from("organization_memberships").delete().eq("user_id", userId).eq("organization_id", ORGANIZATION_ID);
      await supabase.auth.admin.deleteUser(userId);
      throw activityError;
    }
  }

  return userId;
}

export async function updateMonitorName(monitorId: string, fullName: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("profiles").update({ full_name: fullName }).eq("id", monitorId);
  if (error) throw error;
}

/**
 * The only place a monitor/admin's password is ever touched server-side —
 * updateUserById() sets it directly in Supabase Auth. Never read back,
 * never logged: the caller only learns whether this succeeded.
 */
export async function updateAccountPassword(userId: string, newPassword: string): Promise<void> {
  const supabase = getServiceRoleClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
  if (error) throw error;
}
