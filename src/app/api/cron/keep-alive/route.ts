import { NextResponse } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getServiceRoleClient, ORGANIZATION_ID } from "@/lib/supabase/service";

/**
 * Supabase's free tier pauses a project after 7 days with no activity. This
 * runs on a Vercel Cron (see vercel.json) well inside that window purely to
 * keep the project active — the query itself is throwaway, a single cheap
 * read is enough to count as activity.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get("authorization");
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }
  }

  if (!isSupabaseConfigured) {
    return NextResponse.json({ ok: true, skipped: "Supabase not configured" });
  }

  const supabase = getServiceRoleClient();
  const { error } = await supabase.from("organizations").select("id").eq("id", ORGANIZATION_ID).limit(1);
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, pingedAt: new Date().toISOString() });
}
