import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { subscribeToAdminUpdates, type AdminLiveEvent } from "@/server/demo/notifications-store";

// Same SSE approach as /api/notifications/stream. In Supabase mode this
// subscribes directly to Postgres changes on attendance and
// activity_day_state (both already in the supabase_realtime publication) —
// not a second real-time system, just the same "one server-side subscription
// per open admin tab" pattern, sourced from Postgres instead of an in-process
// EventEmitter that can't be relied on across Vercel's serverless instances.
export const dynamic = "force-dynamic";

// Without this, Vercel's default Serverless Function timeout (as low as
// 10-15s depending on plan) cuts the connection before the first heartbeat
// ever fires, turning "live updates" into a constant reconnect loop instead
// of a stable stream. 60s is the highest value guaranteed to be accepted on
// every Vercel plan (Hobby's own hard ceiling), safely above HEARTBEAT_MS.
export const maxDuration = 60;

const HEARTBEAT_MS = 25_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "ADMIN") {
    return new Response("Unauthorized", { status: 401 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: AdminLiveEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), HEARTBEAT_MS);

      if (!isSupabaseConfigured) {
        cleanup = subscribeToAdminUpdates(send);
        return;
      }

      const supabase = getServiceRoleClient();
      const channel = supabase
        // Unique per connection: two admin tabs must not share one
        // Realtime channel object on the cached shared client.
        .channel(`admin-live-attendance-and-closure-${crypto.randomUUID()}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "attendance" }, (payload) => {
          const row = (payload.new ?? payload.old) as { activity_id: string };
          send({ activityId: row.activity_id });
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "activity_day_state" }, (payload) => {
          const row = (payload.new ?? payload.old) as { activity_id: string };
          send({ activityId: row.activity_id });
        })
        .subscribe();
      cleanup = () => {
        supabase.removeChannel(channel);
      };
    },
    cancel() {
      cleanup?.();
      if (heartbeat) clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
