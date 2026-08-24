import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivityDetail, getActivityIdForMonitor } from "@/features/presence/application/queries";
import { ActivityTabs } from "@/features/presence/ui/activity-tabs";
import { ChildEveningRow } from "@/features/presence/ui/child-evening-row";
import { ChildMorningRow } from "@/features/presence/ui/child-morning-row";
import { ClosureControl } from "@/features/presence/ui/closure-control";
import { CounterBar } from "@/features/presence/ui/counter-bar";
import { requireUser } from "@/lib/auth/require-user";

export default async function ActivityDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab } = await searchParams;
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Moniteur : {activity.monitorName}</p>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{activity.name}</h1>
          {activity.closed ? <p className="mt-1 text-sm font-semibold text-[var(--muted)]">✓ Séance clôturée</p> : null}
        </div>
        {!activity.closed ? <ClosureControl activityId={id} /> : null}
      </div>

      <ActivityTabs
        defaultTab={tab === "evening" ? "evening" : "morning"}
        morning={
          <div className="space-y-4">
            <CounterBar
              items={[
                { value: activity.morningCounters.total, label: "Enfants" },
                { value: activity.morningCounters.arrivedCount, label: "Arrivés", tone: "success" },
                { value: activity.morningCounters.absentCount, label: "Absents", tone: "danger" },
              ]}
            />
            {activity.morningList.length === 0 ? (
              <EmptyState title="Aucun enfant sur cette activité." />
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                {activity.morningList.map((child) => (
                  <ChildMorningRow key={child.childId} activityId={id} child={child} locked={activity.closed} />
                ))}
              </ul>
            )}
          </div>
        }
        evening={
          <div className="space-y-4">
            <CounterBar
              items={[
                { value: activity.eveningCounters.presentTotal, label: "Présents" },
                { value: activity.eveningCounters.leftCount, label: "Partis", tone: "success" },
                { value: activity.eveningCounters.stillPresentCount, label: "Encore présents", tone: "warning" },
              ]}
            />
            {activity.eveningList.length === 0 ? (
              <EmptyState
                title="Aucun enfant à faire partir pour l'instant."
                description="La liste se remplit avec les enfants arrivés qui ne sont pas inscrits en garderie automatique."
              />
            ) : (
              <ul className="overflow-hidden rounded-2xl border border-[var(--border)] bg-white">
                {activity.eveningList.map((child) => (
                  <ChildEveningRow key={child.childId} activityId={id} child={child} locked={activity.closed} />
                ))}
              </ul>
            )}
          </div>
        }
      />
    </div>
  );
}
