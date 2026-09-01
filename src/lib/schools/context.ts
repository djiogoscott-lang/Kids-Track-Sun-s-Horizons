import { cache } from "react";
import { cookies } from "next/headers";
import { BOOTSTRAP_ORGANIZATION_ID, getServiceRoleClient } from "@/lib/supabase/service";
import { getCurrentUser } from "@/lib/auth/session";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // Passwordless local sign-in adopts a REAL user id whenever Supabase holds
  // the data (see lib/auth/sign-in-accounts.ts), so the membership read below
  // applies to it unchanged — same rows, same roles, same isolation as
  // production. The fallback here is only for a seed id like "user-admin",
  // which has no membership row at all and would make the query fail with
  // 22P02 rather than return nothing.
  if (!UUID_RE.test(user.id)) {
    const { data, error } = await supabase.from("organizations").select("id, name, active").eq("id", BOOTSTRAP_ORGANIZATION_ID).maybeSingle();
    if (error) throw error;
    const org = data as { id: string; name: string; active: boolean } | null;
    return org ? [{ schoolId: org.id, name: org.name, active: org.active, role: user.role }] : [];
  }

  const { data, error } = await supabase
    .from("organization_memberships")
    .select("organization_id, role, organizations!inner(id, name, active)")
    .eq("user_id", user.id)
    .is("revoked_at", null);
  if (error) throw error;

  const memberships: SchoolMembership[] = (data ?? []).map((row) => {
    const org = row.organizations as unknown as { id: string; name: string; active: boolean };
    return { schoolId: row.organization_id as string, name: org.name, active: org.active, role: row.role as UserRole };
  });

  // A super admin can open any school, including one they just created and
  // are not a member of — otherwise creating a school produces something
  // nobody can enter. This is the explicit permission the flag grants, not a
  // blanket bypass: everything else still goes through the normal
  // school-scoped path once a school is open, and a non-super-admin gets
  // exactly their memberships.
  //
  // Their own memberships stay FIRST so the implicit default (see
  // getActiveSchoolId) remains their real school — being promoted must not
  // silently move an admin into someone else's school on next sign-in.
  const { data: profile, error: profileErr } = await supabase.from("profiles").select("is_super_admin").eq("id", user.id).maybeSingle();
  if (profileErr) throw profileErr;
  if (!(profile as { is_super_admin: boolean } | null)?.is_super_admin) return memberships;

  const own = new Set(memberships.map((m) => m.schoolId));
  const { data: allOrgs, error: orgErr } = await supabase.from("organizations").select("id, name, active").order("name");
  if (orgErr) throw orgErr;
  const others: SchoolMembership[] = (allOrgs ?? [])
    .filter((org) => !own.has(org.id as string))
    .map((org) => ({ schoolId: org.id as string, name: org.name as string, active: org.active as boolean, role: "ADMIN" as UserRole }));

  return [...memberships, ...others];
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
