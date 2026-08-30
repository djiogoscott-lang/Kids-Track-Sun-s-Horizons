import { redirect } from "next/navigation";
import { notFound } from "next/navigation";
import { DismissibleTip } from "@/components/ui/dismissible-tip";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivityDetail, getActivityIdForMonitor } from "@/features/presence/application/queries";
import { ActivityIcon, activityStyle } from "@/features/presence/ui/activity-icons";
import { ActivityOverview } from "@/features/presence/ui/activity-overview";
import { ActivityTabs } from "@/features/presence/ui/activity-tabs";
import { ChildEveningRow } from "@/features/presence/ui/child-evening-row";
import { ChildMorningRow } from "@/features/presence/ui/child-morning-row";
import { ClosureControl } from "@/features/presence/ui/closure-control";
import { CounterBar } from "@/features/presence/ui/counter-bar";
import { NewSessionControl } from "@/features/presence/ui/new-session-control";
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

  if (user.role === "MONITOR") {
    const ownActivityId = await getActivityIdForMonitor(user.id);
    if (ownActivityId !== id) {
      if (ownActivityId) redirect(`/activities/${ownActivityId}`);
      notFound();
    }
  }

  const activity = await getActivityDetail(id);
  if (!activity) notFound();
  const style = activityStyle(id);
  const now = new Date();

  // No ?tab= yet: this is the landing screen — a quick "where am I in the
  // day" overview, not the full roster. Présences/Départs open the detail
  // view below via their own card.
  if (!tab) {
    return (
      <div className="animate-float-in space-y-6">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: style.bg, color: style.color }}>
            <ActivityIcon activityId={id} size={24} strokeWidth={2} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Moniteur : {activity.monitorName}</p>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{activity.name}</h1>
          </div>
        </div>
        <ActivityOverview activityId={id} activity={activity} now={now} />
      </div>
    );
  }

  return (
    <div className="animate-float-in space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: style.bg, color: style.color }}
          >
            <ActivityIcon activityId={id} size={24} strokeWidth={2} />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Moniteur : {activity.monitorName}</p>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{activity.name}</h1>
            <p className="mt-0.5 text-sm font-semibold text-[var(--muted)]">
              {activity.sessionState === "CLOSED"
                ? "✓ Cette séance est déjà clôturée."
                : activity.sessionState === "NOT_STARTED"
                  ? "⚪ Appel non commencé"
                  : "🟡 Appel en cours"}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          {user.role === "ADMIN" ? <NewSessionControl activityId={id} activityName={activity.name} now={now} /> : null}
          {!activity.closed ? (
            <ClosureControl
              activityId={id}
              activityName={activity.name}
              now={now}
              counts={{
                arrivedCount: activity.morningCounters.arrivedCount,
                absentCount: activity.morningCounters.absentCount,
                notMarkedCount: activity.morningCounters.notMarkedCount,
                leftCount: activity.eveningCounters.leftCount,
                stillPresentCount: activity.eveningCounters.stillPresentCount,
                garderieCount: activity.garderieCount,
              }}
            />
          ) : null}
        </div>
      </div>

      <ActivityTabs
        defaultTab={tab === "evening" ? "evening" : "morning"}
        morning={
          <div className="space-y-4">
            <CounterBar
              title="Présence du jour"
              items={[
                { value: activity.morningCounters.total, label: "Enfants" },
                { value: activity.morningCounters.arrivedCount, label: "Arrivés", tone: "success" },
                { value: activity.morningCounters.absentCount, label: "Absents", tone: "danger" },
                { value: activity.morningCounters.notMarkedCount, label: "À traiter", tone: "primary" },
              ]}
            />
            <DismissibleTip storageKey="kt_tip_presence_buttons">
              Appuie directement sur <strong>Arrivé</strong> ou <strong>Absent</strong> pour chaque enfant — le compteur se met à jour aussitôt.
            </DismissibleTip>
            {activity.morningList.length === 0 ? (
              <EmptyState title="Aucun enfant sur cette activité." />
            ) : (
              <ul className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
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
              title="Départs"
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
              <ul className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
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
