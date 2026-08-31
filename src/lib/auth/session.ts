import { cookies } from "next/headers";
import type { UserRole } from "@/lib/constants/roles";
import { DEMO_SESSION_COOKIE, decodeDemoSession } from "@/lib/auth/demo-session";
import { isSupabaseAuthEnabled } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseAuthEnabled) {
    const cookieStore = await cookies();
    const payload = await decodeDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
    return payload ? { id: payload.userId, name: payload.name, role: payload.role } : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  // Deliberately not maybeSingle(): a user can belong to several schools, and
  // maybeSingle() errors out on more than one row — which resolved to
  // `membership = null` and logged multi-school users out entirely. The role
  // returned here is the one for the school the request is working in; the
  // same person can be an admin of one school and a monitor in another.
  const { data: memberships, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error || !memberships || memberships.length === 0) return null;

  const name = (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Membre";

  if (memberships.length === 1) {
    return { id: user.id, name, role: memberships[0].role as UserRole };
  }

  // Resolving which school is active needs the cookie, and it is validated
  // against exactly these membership rows — never trusted on its own.
  const { ACTIVE_SCHOOL_COOKIE } = await import("@/lib/schools/context");
  const preferred = (await cookies()).get(ACTIVE_SCHOOL_COOKIE)?.value;
  const active = memberships.find((m) => m.organization_id === preferred) ?? memberships[0];
  return { id: user.id, name, role: active.role as UserRole };
}

/**
 * A monitor manages exactly one activity, so their home is that activity's
 * screen directly rather than a list to choose from (see features/presence).
 */
export async function resolveHomePath(user: CurrentUser): Promise<string> {
  if (user.role === "ADMIN") return "/activities";
  const { getActivityIdForMonitor } = await import("@/features/presence/application/queries");
  const activityId = await getActivityIdForMonitor(user.id);
  return activityId ? `/activities/${activityId}` : "/activities";
}
