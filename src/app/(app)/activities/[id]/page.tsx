import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivityDetail, getActivityIdForMonitor } from "@/features/presence/application/queries";
import { ActivityTabs } from "@/features/presence/ui/activity-tabs";
import { ChildEveningRow } from "@/features/presence/ui/child-evening-row";
import { ChildMorningRow } from "@/features/presence/ui/child-morning-row";
import { requireUser } from "@/lib/auth/require-user";

export default async function ActivityDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  if (user.role === "MONITOR" && getActivityIdForMonitor(user.id) !== id) {
    const ownActivityId = getActivityIdForMonitor(user.id);
    if (ownActivityId) redirect(`/activities/${ownActivityId}`);
    notFound();
  }

  const activity = getActivityDetail(id);
  if (!activity) notFound();

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Moniteur : {activity.monitorName}</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{activity.name}</h1>
      </div>

      <ActivityTabs
        morning={
          activity.morningList.length === 0 ? (
            <EmptyState title="Aucun enfant sur cette activité." />
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
              {activity.morningList.map((child) => (
                <ChildMorningRow key={child.childId} activityId={id} child={child} />
              ))}
            </ul>
          )
        }
        evening={
          activity.eveningList.length === 0 ? (
            <EmptyState title="Aucun enfant arrivé aujourd'hui." description="La liste de départ se remplit au fur et à mesure des arrivées." />
          ) : (
            <ul className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
              {activity.eveningList.map((child) => (
                <ChildEveningRow key={child.childId} activityId={id} child={child} />
              ))}
            </ul>
          )
        }
      />
    </div>
  );
}
