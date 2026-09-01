import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getChildForAdmin } from "@/features/presence/application/queries";
import { getChildHistory } from "@/features/presence/application/history-queries";
import { ChildActiveToggle } from "@/features/presence/ui/child-active-toggle";
import { ChildForm } from "@/features/presence/ui/child-form";
import { DeleteChildDialog } from "@/features/presence/ui/delete-child-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong, formatTime } from "@/lib/format";
import { getActivitiesList } from "@/server/data-source";

const STATUS_LABEL: Record<string, string> = {
  ABSENT: "🔴 Absent",
  LEFT: "🔵 Parti",
  STILL_PRESENT: "⚪ Encore présent",
  DAYCARE: "🟠 Garderie",
};

export default async function EditChildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("ADMIN");
  const { id } = await params;
  const [child, allActivities, history] = await Promise.all([getChildForAdmin(id), getActivitiesList(), getChildHistory(id)]);
  if (!child) notFound();
  // Reassignment can only target an active activity, except the child's own
  // current one — kept selectable (even if since deactivated) so editing
  // this form never silently strands an existing assignment.
  const activities = allActivities.filter((a) => a.active || a.id === child.activityId);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
            {child.firstName} {child.lastName}
          </h1>
          <p className="mt-1 text-xs text-[var(--muted)]">
            {child.active ? "🟢 Actif" : "🔴 Désactivé"}
            {child.isDemo ? " · Démo" : ""}
          </p>
        </div>
        <ChildActiveToggle childId={child.id} active={child.active} />
      </div>
      <ChildForm
        activities={activities}
        childId={child.id}
        initial={{
          firstName: child.firstName,
          lastName: child.lastName,
          activityId: child.activityId,
          daycareAuto: child.daycareAuto,
          notes: child.notes,
          schoolClass: child.schoolClass,
          birthDate: child.birthDate,
          phone: child.phone,
          email: child.email,
        }}
      />

      <section className="space-y-3">
        <h2 className="text-lg font-bold text-[var(--foreground)]">Historique des présences</h2>
        {history.length === 0 ? (
          <p className="text-sm text-[var(--muted)]">Aucune présence enregistrée pour l&apos;instant.</p>
        ) : (
          <Card>
            <CardContent className="divide-y divide-[var(--border)] p-0">
              {history.map((row) => (
                <div key={row.date} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="font-semibold text-[var(--foreground)]">{formatDateLong(new Date(`${row.date}T12:00:00`))}</p>
                    <p className="text-xs text-[var(--muted)]">{row.activityName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-[var(--foreground)]">
                      {row.arrivedAt ? formatTime(row.arrivedAt) : "—"} → {row.departedAt ? formatTime(row.departedAt) : "—"}
                    </p>
                    <p className="text-xs font-semibold text-[var(--muted)]">{STATUS_LABEL[row.status]}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section className="rounded-2xl border border-[var(--danger)]/30 bg-red-50/40 p-5">
        <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--danger)]">Zone dangereuse</h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Le bouton {child.active ? "Désactiver" : "Réactiver"} en haut de page retire l&apos;enfant des listes actives sans rien perdre. La suppression définitive ci-dessous est irréversible.
        </p>
        <div className="mt-3">
          <DeleteChildDialog childId={child.id} childName={`${child.firstName} ${child.lastName}`} />
        </div>
      </section>
    </div>
  );
}
