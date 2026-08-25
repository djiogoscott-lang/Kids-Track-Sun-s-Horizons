import { EmptyState } from "@/components/ui/empty-state";
import { getActivitiesList } from "@/server/data-source";
import { getActivityDetail } from "@/features/presence/application/queries";
import { ActivityIcon, activityStyle } from "@/features/presence/ui/activity-icons";
import { ChildEveningRow } from "@/features/presence/ui/child-evening-row";
import { CounterBar } from "@/features/presence/ui/counter-bar";
import { requireUser } from "@/lib/auth/require-user";

export default async function AdminDeparturesPage() {
  await requireUser("ADMIN");
  const activityList = await getActivitiesList();
  const activities = (await Promise.all(activityList.map((a) => getActivityDetail(a.id)))).filter((a) => a !== null);
  const present = activities.reduce((sum, a) => sum + a.eveningCounters.presentTotal, 0);
  const left = activities.reduce((sum, a) => sum + a.eveningCounters.leftCount, 0);
  const stillPresent = activities.reduce((sum, a) => sum + a.eveningCounters.stillPresentCount, 0);

  return (
    <div className="animate-float-in space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">🚪 Départs</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Toutes les activités du jour.</p>
      </div>

      <CounterBar
        title="Aujourd'hui"
        items={[
          { value: present, label: "Présents" },
          { value: left, label: "Partis", tone: "success" },
          { value: stillPresent, label: "Encore présents", tone: "warning" },
        ]}
      />

      {activities.map((activity) => {
        const style = activityStyle(activity.id);
        return (
          <section key={activity.id} className="space-y-3">
            <div className="flex items-center gap-2.5">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                <ActivityIcon activityId={activity.id} size={18} strokeWidth={2} />
              </span>
              <h2 className="font-heading text-lg font-bold text-[var(--foreground)]">{activity.name}</h2>
              <span className="text-sm text-[var(--muted)]">
                {activity.eveningCounters.leftCount}/{activity.eveningCounters.presentTotal} partis
              </span>
              {activity.closed ? <span className="text-xs font-semibold text-[var(--muted)]">· clôturée</span> : null}
            </div>
            {activity.eveningList.length === 0 ? (
              <EmptyState title="Aucun enfant à faire partir pour l'instant." />
            ) : (
              <ul className="overflow-hidden rounded-3xl border border-[var(--border)] bg-white">
                {activity.eveningList.map((child) => (
                  <ChildEveningRow key={child.childId} activityId={activity.id} child={child} locked={activity.closed} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
