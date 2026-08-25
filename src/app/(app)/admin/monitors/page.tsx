import { Card, CardContent } from "@/components/ui/card";
import { listAssignments } from "@/features/presence/application/queries";
import { AssignmentForm } from "@/features/presence/ui/assignment-form";
import { requireUser } from "@/lib/auth/require-user";
import { getMonitorsList } from "@/server/data-source";

export default async function AdminMonitorsPage() {
  await requireUser("ADMIN");
  const [assignments, monitors] = await Promise.all([listAssignments(), getMonitorsList()]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Moniteurs</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Associer un moniteur à chaque activité.</p>
      </div>

      <Card>
        <CardContent className="p-0">
          {assignments.map((assignment) => (
            <AssignmentForm key={assignment.activityId} assignment={assignment} monitors={monitors} />
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
