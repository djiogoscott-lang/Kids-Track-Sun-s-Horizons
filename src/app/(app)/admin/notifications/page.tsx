import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getAllNotificationsForAdmin } from "@/features/presence/application/queries";
import { NotificationComposer } from "@/features/presence/ui/notification-composer";
import { requireUser } from "@/lib/auth/require-user";
import { formatTime } from "@/lib/format";
import { ACTIVITIES } from "@/server/demo/data";

export default async function AdminNotificationsPage() {
  await requireUser("ADMIN");
  const notifications = getAllNotificationsForAdmin();

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">📢 Notifications</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Transmettre une information au moniteur d&apos;une activité.</p>
      </div>

      <Card>
        <CardContent>
          <NotificationComposer activities={ACTIVITIES} />
        </CardContent>
      </Card>

      <section>
        <h2 className="mb-3 text-lg font-bold text-[var(--foreground)]">Envoyées</h2>
        {notifications.length === 0 ? (
          <EmptyState title="Aucune notification envoyée pour l'instant." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-[var(--border)] p-0">
              {notifications.map((n) => (
                <div key={n.id} className="px-5 py-4">
                  <p className="text-sm text-[var(--foreground)]">{n.message}</p>
                  <p className="mt-1 text-xs text-[var(--muted)]">
                    {n.activityName} · {formatTime(n.createdAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>
    </div>
  );
}
