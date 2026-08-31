import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "@/lib/env";

/**
 * Privileged, server-only client. Never import this from a "use client"
 * file or a route that runs in the browser — SUPABASE_SERVICE_ROLE_KEY has
 * no NEXT_PUBLIC_ prefix specifically so Next.js never inlines it into a
 * client bundle, but the import itself should still only ever happen from
 * trusted server code (Server Components, Server Actions, Route Handlers).
 *
 * Bypasses RLS entirely. Authorization is enforced the same way it already
 * is for demo mode: requireUser()/assertActivityAccess() before this is
 * ever called. This is a deliberate bridge until real Supabase Auth
 * sessions exist in the browser (NEXT_PUBLIC_SUPABASE_AUTH_ENABLED=true),
 * at which point RLS itself becomes the enforcement layer for realtime and
 * any future direct client-side access.
 */
let cached: SupabaseClient | null = null;

export function getServiceRoleClient(): SupabaseClient {
  if (cached) return cached;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Supabase service role client requested but not configured.");
  }
  cached = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}

/**
 * The first school's id, kept ONLY for paths that run without a user session
 * and therefore cannot resolve a school from one — currently just the
 * keep-alive cron, which pings a single row to stop Supabase pausing the
 * project.
 *
 * Application code must never use this to scope data: a school is resolved
 * per request from the signed-in user's memberships (see
 * lib/schools/context.ts). Scoping a query with this constant would pin it
 * to one school regardless of who is asking, which is precisely the
 * single-tenant assumption the multi-school work removed.
 */
export const BOOTSTRAP_ORGANIZATION_ID = "00000000-0000-0000-0000-000000000001";
