import { cache } from "react";
import { cookies } from "next/headers";
import { BOOTSTRAP_ORGANIZATION_ID, getServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseAuthEnabled } from "@/lib/env";
import type { UserRole } from "@/lib/constants/roles";

/**
 * Which school the request is working in.
 *
 * A "school" is an organizations row: the schema was multi-tenant from the
 * start (every business table carries organization_id, every RLS policy
 * scopes through it) and only the application layer pinned it to a single
 * hardcoded id. This module replaces that constant with a value resolved
 * from the session.
 *
 * The active school is NEVER taken from client input. The cookie below only
 * expresses a *preference*; it is always checked against the user's real
 * memberships before being honoured, so pasting another school's UUID into
 * it grants nothing. Everything downstream — queries, commands, Server
 * Actions, imports — reads the school from here, which is what makes the
 * isolation impossible to bypass by crafting a request.
 */

export const ACTIVE_SCHOOL_COOKIE = "kt_school";

export interface SchoolMembership {
  schoolId: string;
  name: string;
  active: boolean;
  role: UserRole;
}

export class NoSchoolAccessError extends Error {
  constructor(message = "Aucune école ne vous est attribuée.") {
    super(message);
  }
}

/**
 * Every school the signed-in user actually belongs to, newest membership
 * last. Read with the service-role client because RLS on organizations
 * requires an active membership to already be established — which is the
 * very thing being looked up. The query is still scoped to this user's own
 * membership rows, so it can only ever return their own schools.
 */
export const getUserSchools = cache(async (): Promise<SchoolMembership[]> => {
  const user = await getCurrentUser();
  if (!user) return [];

  const supabase = getServiceRoleClient();

  // Demo sessions carry ids like "user-admin", which are not UUIDs and have
  // no membership rows — querying organization_memberships with one is a
  // hard 22P02 error, not an empty result. Demo mode is a local testing
  // bridge with no real accounts, so membership has to be simulated.
  //
  // Only the demo ADMIN gets every school (they stand in for the super admin
  // locally, and the schools screen has to be exercisable). A demo MONITOR
  // gets the bootstrap school only: granting them every school made the
  // school switcher offer schools they have no business seeing, which both
  // misrepresents production — where real memberships decide — and makes
  // demo mode useless for testing isolation, since every user would pass.
  if (!isSupabaseAuthEnabled) {
    if (user.role !== "ADMIN") {
      const { data, error } = await supabase
        .from("organizations")
        .select("id, name, active")
        .eq("id", BOOTSTRAP_ORGANIZATION_ID)
        .maybeSingle();
      if (error) throw error;
      const org = data as { id: string; name: string; active: boolean } | null;
      return org ? [{ schoolId: org.id, name: org.name, active: org.active, role: user.role }] : [];
    }
    const { data, error } = await supabase.from("organizations").select("id, name, active").order("name");
    if (error) throw error;
    return (data ?? []).map((org) => ({ schoolId: org.id, name: org.name, active: org.active, role: user.role }));
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations!inner(id, name, active)")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error) throw error;

  return (data ?? []).map((row) => {
    const org = row.organizations as unknown as { id: string; name: string; active: boolean };
    return { schoolId: row.organization_id as string, name: org.name, active: org.active, role: row.role as UserRole };
  });
});

/**
 * The school this request operates on, or null when the user belongs to
 * none. Prefers the cookie only if it names a school the user is genuinely a
 * member of; otherwise falls back to their first active school, so a user
 * with exactly one school never has to choose anything.
 *
 * Deactivated schools stay reachable when explicitly selected — an admin
 * must still be able to open one to consult its history — but are never
 * chosen as the implicit default.
 */
export const getActiveSchoolId = cache(async (): Promise<string | null> => {
  const schools = await getUserSchools();
  if (schools.length === 0) return null;

  const cookieStore = await cookies();
  const preferred = cookieStore.get(ACTIVE_SCHOOL_COOKIE)?.value;
  if (preferred && schools.some((s) => s.schoolId === preferred)) return preferred;

  return (schools.find((s) => s.active) ?? schools[0]).schoolId;
});

/**
 * Same as getActiveSchoolId but throws instead of returning null — for the
 * repository layer, where "no school" is never a legitimate state to query
 * with. Returning null there would silently widen a query to every school,
 * which is exactly the failure mode this whole module exists to prevent.
 */
export async function requireActiveSchoolId(): Promise<string> {
  const schoolId = await getActiveSchoolId();
  if (!schoolId) throw new NoSchoolAccessError();
  return schoolId;
}

/** The user's role *in the active school*, since role is per-membership:
 * the same person can be an admin of one school and a monitor in another. */
export const getActiveSchoolRole = cache(async (): Promise<UserRole | null> => {
  const [schools, activeId] = await Promise.all([getUserSchools(), getActiveSchoolId()]);
  return schools.find((s) => s.schoolId === activeId)?.role ?? null;
});
