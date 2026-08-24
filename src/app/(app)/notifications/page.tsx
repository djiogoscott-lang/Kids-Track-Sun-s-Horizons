import { redirect } from "next/navigation";
import { NotificationList } from "@/features/notifications/notification-list";
import { requireUser } from "@/lib/auth/require-user";

export default async function NotificationsPage() {
  const user = await requireUser();
  if (user.role === "ADMIN") redirect("/admin/notifications");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">🔔 Notifications</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Informations transmises par l&apos;administration pour votre activité.</p>
      </div>
      <NotificationList />
    </div>
  );
}
