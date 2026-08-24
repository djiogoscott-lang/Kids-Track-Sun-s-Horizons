"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_SESSION_COOKIE, encodeDemoSession } from "@/lib/auth/demo-session";
import { homePathForRole } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";
import { getDemoState } from "@/server/demo/store";

export async function signInDemoAction(userId: string) {
  if (isSupabaseConfigured) return;

  const user = getDemoState().users.find((u) => u.id === userId);
  if (!user) return;

  const cookieStore = await cookies();
  cookieStore.set(DEMO_SESSION_COOKIE, await encodeDemoSession({ userId: user.id, name: user.name, role: user.role }), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });

  redirect(homePathForRole(user.role));
}

export async function signOutAction() {
  if (isSupabaseConfigured) {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } else {
    const cookieStore = await cookies();
    cookieStore.delete(DEMO_SESSION_COOKIE);
  }
  redirect("/login");
}
