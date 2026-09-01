import "server-only";
import type { UserRole } from "@/lib/constants/roles";
import { isSupabaseConfigured } from "@/lib/env";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { ACTIVITIES, DEMO_USERS, INITIAL_ACTIVITY_MONITORS } from "@/server/demo/data";

/**
 * Who can be signed in as, when passwordless demo sign-in is on.
 *
 * Demo sign-in used to offer a fixed cast — "Moniteur 1 · Appel et départ —
 * Danse" — built from the seed in server/demo/data.ts. Once real activities
 * lived in Supabase and the school renamed them, none of those names matched
 * anything: every demo monitor landed on "Votre activité n'est pas encore
 * attribuée", and the whole monitor interface became untestable locally.
 * Worse, the app then needed a web of name-based bridges to translate demo
 * ids back to real rows, and those bridges misreported reality (a real
 * monitor assignment showing as "Aucun moniteur", which the admin screen then
 * offered to save back over the truth).
 *
 * So when Supabase holds the data, this lists the REAL accounts and signing
 * in adopts a real user id. Every downstream lookup — memberships, school,
 * activity, recorded_by — then takes the same path as production, with no
 * translation layer left to disagree with the database.
 *
 * This is still only reachable when NEXT_PUBLIC_SUPABASE_AUTH_ENABLED is
 * false, i.e. never in the deployed app (see signInDemoAction, which returns
 * immediately when real auth is on).
 */
export interface SignInAccount {
  id: string;
  name: string;
  role: UserRole;
  /** What this account will actually see — shown on the sign-in card so the
   * choice is honest about scope rather than describing a fixed demo. */
  schoolNames: string[];
  activityName: string | null;
}

function demoAccounts(): SignInAccount[] {
  return DEMO_USERS.map((u) => {
    const activityId = Object.entries(INITIAL_ACTIVITY_MONITORS).find(([, monitorId]) => monitorId === u.id)?.[0];
    return {
      id: u.id,
      name: u.name,
      role: u.role,
      schoolNames: [],
      activityName: u.role === "MONITOR" ? (ACTIVITIES.find((a) => a.id === activityId)?.name ?? null) : null,
    };
  });
}

export async function listSignInAccounts(): Promise<SignInAccount[]> {
  if (!isSupabaseConfigured) return demoAccounts();

  const supabase = getServiceRoleClient();
  // Cross-tenant by design: this runs before anyone is signed in, so there is
  // no active school to scope to yet. It exposes nothing a sign-in screen
  // does not already have to show.
  const [{ data: memberships, error: mErr }, { data: profiles, error: pErr }, { data: activities, error: aErr }, { data: orgs, error: oErr }] =
    await Promise.all([
      supabase.from("organization_memberships").select("user_id, role, organization_id").is("revoked_at", null),
      supabase.from("profiles").select("id, full_name"),
      supabase.from("activities").select("id, name, monitor_id").eq("active", true),
      supabase.from("organizations").select("id, name"),
    ]);
  if (mErr || pErr || aErr || oErr) throw mErr ?? pErr ?? aErr ?? oErr;

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name as string | null]));
  const orgNameById = new Map((orgs ?? []).map((o) => [o.id, o.name as string]));
  const activityByMonitor = new Map((activities ?? []).filter((a) => a.monitor_id).map((a) => [a.monitor_id as string, a.name as string]));

  const byUser = new Map<string, SignInAccount>();
  for (const m of memberships ?? []) {
    const existing = byUser.get(m.user_id);
    const schoolName = orgNameById.get(m.organization_id);
    if (existing) {
      // Several memberships = a genuinely multi-school user. ADMIN wins for
      // the label because it is the wider of the two roles.
      if (m.role === "ADMIN") existing.role = "ADMIN";
      if (schoolName) existing.schoolNames.push(schoolName);
      continue;
    }
    byUser.set(m.user_id, {
      id: m.user_id,
      name: nameById.get(m.user_id) || "Compte sans nom",
      role: m.role as UserRole,
      schoolNames: schoolName ? [schoolName] : [],
      activityName: activityByMonitor.get(m.user_id) ?? null,
    });
  }

  return [...byUser.values()].sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "ADMIN" ? -1 : 1));
}
