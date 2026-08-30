import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivitiesList, getRosterWeekStatus, weekBounds } from "@/server/data-source";
import { getRosterForWeekView, listChildrenForAdmin } from "@/features/presence/application/queries";
import { AddToRosterDialog } from "@/features/presence/ui/add-to-roster-dialog";
import { DuplicateWeekButton } from "@/features/presence/ui/duplicate-week-button";
import { ResetRosterDialog } from "@/features/presence/ui/reset-roster-dialog";
import { RosterExportControl } from "@/features/presence/ui/roster-export-control";
import { RosterImportDialog } from "@/features/presence/ui/roster-import-dialog";
import { RosterParticipantRow } from "@/features/presence/ui/roster-participant-row";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong, parseDateKey, toDateKey } from "@/lib/format";

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export default async function AdminRosterPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  await requireUser("ADMIN");
  const { start } = await searchParams;
  const { weekStart, weekEnd } = weekBounds(parseDateKey(start));
  const previousWeekStart = shiftDate(weekStart, -7);
  const thisWeekStart = weekBounds(new Date()).weekStart;

  const [activities, roster, allChildren, weekStatus] = await Promise.all([
    getActivitiesList(),
    getRosterForWeekView(weekStart),
    listChildrenForAdmin(),
    getRosterWeekStatus(weekStart),
  ]);
  const activeChildren = allChildren.filter((c) => c.active);
  const totalParticipants = roster.reduce((sum, a) => sum + a.participants.length, 0);

  return (
    <div className="animate-float-in space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Participants de la semaine</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Roster actif par activité — distinct de la base permanente des enfants. Retirer un participant ne supprime jamais sa fiche.
        </p>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
        <Link href={`/admin/roster?start=${previousWeekStart}`} className="tap-scale flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] hover:bg-[var(--background)]" aria-label="Semaine précédente">
          <ChevronLeft size={20} />
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--foreground)]">
            Semaine du {formatDateLong(new Date(`${weekStart}T12:00:00`))} au {formatDateLong(new Date(`${weekEnd}T12:00:00`))}
          </p>
          {weekStart !== thisWeekStart ? (
            <Link href={`/admin/roster?start=${thisWeekStart}`} className="text-xs font-semibold text-[var(--primary)]">
              Semaine en cours
            </Link>
          ) : null}
        </div>
        <Link href={`/admin/roster?start=${shiftDate(weekStart, 7)}`} className="tap-scale flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] hover:bg-[var(--background)]" aria-label="Semaine suivante">
          <ChevronRight size={20} />
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <RosterImportDialog
          weekStart={weekStart}
          weekLabel={`${formatDateLong(new Date(`${weekStart}T12:00:00`))} au ${formatDateLong(new Date(`${weekEnd}T12:00:00`))}`}
          activities={activities.map((a) => ({ id: a.id, name: a.name }))}
        />
        <RosterExportControl weekStart={weekStart} activities={activities.map((a) => ({ id: a.id, name: a.name }))} />
        <a
          href="/api/admin/roster/template"
          className="tap-scale flex h-11 items-center rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]"
        >
          📄 Télécharger le modèle Excel
        </a>
        {totalParticipants === 0 ? <DuplicateWeekButton fromWeekStart={previousWeekStart} toWeekStart={weekStart} /> : null}
      </div>

      {weekStatus.isAnomalous ? (
        <div className="rounded-2xl border-2 border-[var(--danger)] bg-[var(--danger-bg)] p-4 text-sm text-[var(--danger)]">
          <p className="font-bold">⚠️ Anomalie détectée</p>
          <p className="mt-1">
            Le roster de cette semaine a déjà été activé (import, ajout ou duplication) mais ne contient plus aucune ligne. Ce n&apos;est pas l&apos;état
            normal d&apos;une semaine qui n&apos;a jamais eu de roster — vérifiez avant d&apos;ajouter des participants. Vous pouvez dupliquer la semaine
            précédente pour restaurer une base de départ.
          </p>
        </div>
      ) : null}

      {totalParticipants === 0 ? (
        <EmptyState
          title="Aucun participant pour cette semaine."
          description="Ajoutez des participants ci-dessous, importez un fichier Excel, ou dupliquez la semaine précédente."
        />
      ) : null}

      <div className="space-y-4">
        {activities.map((activity) => {
          const activityRoster = roster.find((r) => r.activityId === activity.id);
          const participants = activityRoster?.participants ?? [];
          const candidateChildren = activeChildren.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName, activityName: c.activityName }));

          return (
            <Card key={activity.id}>
              <CardContent className="p-0">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border)] px-4 py-3">
                  <div>
                    <p className="font-heading text-base font-bold uppercase tracking-wide text-[var(--foreground)]">{activity.name}</p>
                    <p className="text-xs text-[var(--muted)]">{participants.length} participant{participants.length > 1 ? "s" : ""}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <AddToRosterDialog
                      activityId={activity.id}
                      activityName={activity.name}
                      weekStart={weekStart}
                      candidateChildren={candidateChildren}
                      alreadyInRoster={participants.map((p) => p.childId)}
                    />
                    <ResetRosterDialog activityId={activity.id} activityName={activity.name} weekStart={weekStart} participantCount={participants.length} />
                  </div>
                </div>
                {participants.length === 0 ? (
                  <p className="px-4 py-4 text-sm text-[var(--muted)]">Aucun participant.</p>
                ) : (
                  <ul className="divide-y divide-[var(--border)]">
                    {participants.map((p) => (
                      <RosterParticipantRow key={p.childId} childId={p.childId} name={`${p.firstName} ${p.lastName}`} weekStart={weekStart} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
