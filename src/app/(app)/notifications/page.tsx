import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivityIdForMonitor, getNotificationsForMonitor } from "@/features/presence/application/queries";
import { requireUser } from "@/lib/auth/require-user";
import { formatTime } from "@/lib/format";

export default async function NotificationsPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/notifications");

  const activityId = getActivityIdForMonitor(user.id);
  const notifications = activityId ? getNotificationsForMonitor(activityId) : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">🔔 Notifications</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Informations transmises par l&apos;administration pour votre activité.</p>
      </div>

      {notifications.length === 0 ? (
        <EmptyState title="Aucune information pour le moment." />
      ) : (
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
      )}
    </div>
  );
}
