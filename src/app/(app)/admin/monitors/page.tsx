import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listAssignments, listMonitorsForAdmin } from "@/features/presence/application/queries";
import { AddMonitorDialog } from "@/features/presence/ui/add-monitor-dialog";
import { AssignmentForm } from "@/features/presence/ui/assignment-form";
import { MonitorActiveToggle } from "@/features/presence/ui/monitor-active-toggle";
import { MonitorNameEdit } from "@/features/presence/ui/monitor-name-edit";
import { MonitorPasswordDialog } from "@/features/presence/ui/monitor-password-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { getActivitiesList, getMonitorsList } from "@/server/data-source";

export default async function AdminMonitorsPage() {
  await requireUser("ADMIN");
  const [assignments, monitors, monitorAdminRows, activities] = await Promise.all([
    listAssignments(),
    getMonitorsList(),
    listMonitorsForAdmin(),
    getActivitiesList(),
  ]);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Moniteurs</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">Comptes, activité assignée et statut.</p>
        </div>
        <AddMonitorDialog activities={activities} />
      </div>

      <section>
        <h2 className="mb-3 text-lg font-bold text-[var(--foreground)]">Comptes</h2>
        {monitorAdminRows.length === 0 ? (
          <EmptyState title="Aucun moniteur enregistré." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-[var(--border)] p-0">
              {monitorAdminRows.map((monitor) => (
                <div key={monitor.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <p className={`font-semibold ${monitor.active ? "text-[var(--foreground)]" : "text-[var(--muted)] line-through"}`}>
                        {monitor.name}
                      </p>
                      <MonitorNameEdit monitorId={monitor.id} currentName={monitor.name} />
                      <MonitorPasswordDialog monitorId={monitor.id} />
                    </div>
                    <p className="text-xs text-[var(--muted)]">
                      {monitor.email ?? "Email indisponible"} · Moniteur · {monitor.activityName ?? "Aucune activité assignée"}
                    </p>
                    <p className="mt-0.5 text-xs font-semibold">
                      {monitor.active ? <span className="text-[var(--success)]">🟢 Actif</span> : <span className="text-[var(--danger)]">🔴 Désactivé</span>}
                    </p>
                  </div>
                  <MonitorActiveToggle monitorId={monitor.id} monitorName={monitor.name} active={monitor.active} />
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-lg font-bold text-[var(--foreground)]">Attribution des activités</h2>
        <Card>
          <CardContent className="p-0">
            {assignments.map((assignment) => (
              <AssignmentForm key={assignment.activityId} assignment={assignment} monitors={monitors} />
            ))}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
