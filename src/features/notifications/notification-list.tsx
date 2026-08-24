"use client";

import { useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { formatTime } from "@/lib/format";

export function NotificationList() {
  const { notifications, markAllRead } = useNotifications();

  useEffect(() => {
    markAllRead();
    // Only on mount: opening this screen is what marks messages read.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (notifications.length === 0) {
    return <EmptyState title="Aucune information pour le moment." />;
  }

  return (
    <Card>
      <CardContent className="divide-y divide-[var(--border)] p-0">
        {notifications.map((n) => (
          <div key={n.id} className="px-5 py-4">
            <p className="text-sm text-[var(--foreground)]">⚠️ {n.message}</p>
            <p className="mt-1 text-xs text-[var(--muted)]">
              {formatTime(n.createdAt)} · {n.createdBy}
            </p>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
