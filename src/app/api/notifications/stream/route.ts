import { getActivityIdForMonitor } from "@/features/presence/application/queries";
import { getCurrentUser } from "@/lib/auth/session";
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

  const activityId = getActivityIdForMonitor(user.id);
  if (!activityId) {
    return new Response("No activity assigned", { status: 404 });
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null = null;
  let heartbeat: ReturnType<typeof setInterval> | null = null;

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: NotificationEvent) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      };
      unsubscribe = subscribeToActivity(activityId, send);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(`: ping\n\n`)), HEARTBEAT_MS);
    },
    cancel() {
      unsubscribe?.();
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
