import { getActivityIdForMonitor } from "@/features/presence/application/queries";
import { getCurrentUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";
import { getServiceRoleClient } from "@/lib/supabase/service";
import { subscribeToActivity, type NotificationEvent } from "@/server/demo/notifications-store";

// Server-Sent Events, not WebSocket or polling: the flow is one-way
// (server -> this one monitor's activity), EventSource reconnects on its
// own if the connection drops, and each viewer holds exactly one lightweight
// HTTP stream instead of a page-wide setInterval refetch.
export const dynamic = "force-dynamic";

const HEARTBEAT_MS = 25_000;

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "MONITOR") {
    return new Response("Unauthorized", { status: 401 });
  }

  const activityId = await getActivityIdForMonitor(user.id);
  if (!activityId) {
    return new Response("No activity assigned", { status: 404 });
  }

  const encoder = new TextEncoder();
  let cleanup: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: NotificationEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), HEARTBEAT_MS);

      if (!isSupabaseConfigured) {
        // Dev-only fallback: an in-process EventEmitter only works because
        // local dev is a single long-lived process. It cannot be relied on
        // in production — see the Supabase branch below.
        cleanup = subscribeToActivity(activityId, send);
        return;
      }

      // Each SSE connection opens its own outbound Realtime subscription to
      // Supabase — unlike the in-process EventEmitter this doesn't depend on
      // the publisher (a Server Action) and this subscriber running in the
      // same instance, which is never guaranteed on Vercel's serverless
      // model. This is what public.notifications was already added to the
      // supabase_realtime publication for (see the foundation migration).
      const supabase = getServiceRoleClient();
      const channel = supabase
        // Unique per connection: two tabs on the same activity must not
        // share one Realtime channel object on the cached shared client.
        .channel(`notifications-activity-${activityId}-${crypto.randomUUID()}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "notifications", filter: `activity_id=eq.${activityId}` },
          (payload) => {
            const row = payload.new as { id: string; message: string; created_at: string };
            send({
              type: "new",
              notification: {
                id: row.id,
                activityId,
                message: row.message,
                createdAt: new Date(row.created_at),
                createdBy: "Administrateur",
                read: false,
                readAt: null,
              },
            });
          },
        )
        .on(
          "postgres_changes",
          { event: "UPDATE", schema: "public", table: "notifications", filter: `activity_id=eq.${activityId}` },
          () => send({ type: "read", activityId }),
        )
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
