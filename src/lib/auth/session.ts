import { cookies } from "next/headers";
import type { UserRole } from "@/lib/constants/roles";
import { DEMO_SESSION_COOKIE, decodeDemoSession } from "@/lib/auth/demo-session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export interface CurrentUser {
  id: string;
  name: string;
  role: UserRole;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured) {
    const cookieStore = await cookies();
    const payload = await decodeDemoSession(cookieStore.get(DEMO_SESSION_COOKIE)?.value);
    return payload ? { id: payload.userId, name: payload.name, role: payload.role } : null;
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: membership } = await supabase
    .from("organization_memberships")
    .select("role")
    .eq("user_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (!membership) return null;

  return {
    id: user.id,
    name: (user.user_metadata?.full_name as string | undefined) ?? user.email ?? "Membre",
    role: membership.role as UserRole,
  };
}

export function homePathForRole(role: UserRole): string {
  return role === "ADMIN" ? "/dashboard" : "/sessions";
}
