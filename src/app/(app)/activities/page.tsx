import { redirect } from "next/navigation";
import { getActivityIdForMonitor, listActivitiesOverview } from "@/features/presence/application/queries";
import { ActivityCard } from "@/features/presence/ui/activity-card";
import { requireUser } from "@/lib/auth/require-user";

export default async function ActivitiesPage() {
  const user = await requireUser();

  if (user.role === "MONITOR") {
    const activityId = getActivityIdForMonitor(user.id);
    if (activityId) redirect(`/activities/${activityId}`);
  }

  const activities = listActivitiesOverview();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Activités</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Vue d&apos;ensemble du jour, par activité.</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {activities.map((activity) => (
          <ActivityCard key={activity.id} activity={activity} />
        ))}
      </div>
    </div>
  );
}
