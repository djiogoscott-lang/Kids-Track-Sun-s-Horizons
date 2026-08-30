import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ActivityRow } from "@/features/presence/ui/activity-row";
import { AddActivityDialog } from "@/features/presence/ui/add-activity-dialog";
import { ResetOperationalDataSection } from "@/features/presence/ui/reset-operational-data-section";
import { requireUser } from "@/lib/auth/require-user";
import { getActivitiesList, getMonitorsList } from "@/server/data-source";

export default async function AdminActivitiesPage() {
  await requireUser("ADMIN");
  const [activities, monitors] = await Promise.all([getActivitiesList(), getMonitorsList()]);
  const sorted = [...activities].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Activités</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{activities.length} activité{activities.length > 1 ? "s" : ""} enregistrée{activities.length > 1 ? "s" : ""}.</p>
        </div>
        <AddActivityDialog monitors={monitors} />
      </div>

      {sorted.length === 0 ? (
        <EmptyState title="Aucune activité enregistrée." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-[var(--border)] p-0">
            {sorted.map((activity) => (
              <ActivityRow key={activity.id} activity={activity} monitors={monitors} />
            ))}
          </CardContent>
        </Card>
      )}

      <ResetOperationalDataSection />
    </div>
  );
}
