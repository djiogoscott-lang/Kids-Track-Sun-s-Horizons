import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { getSessionAttendance, listAnomalies } from "@/features/attendance/application/queries";
import { ClosureControl } from "@/features/attendance/ui/closure-control";
import { CounterStat } from "@/features/attendance/ui/counter-stat";
import { RosterRow } from "@/features/attendance/ui/roster-row";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong, formatTime } from "@/lib/format";
import { getDemoState } from "@/server/demo/store";

const STATUS_LABEL: Record<string, string> = { SCHEDULED: "À venir", ACTIVE: "En cours", CLOSED: "Clôturée" };

export default async function SessionAttendancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const rawSession = getDemoState().sessions.get(id);
  if (!rawSession) notFound();
  if (user.role !== "ADMIN" && !rawSession.monitorIds.includes(user.id)) notFound();

  const view = getSessionAttendance(id);
  if (!view) notFound();

  const now = new Date();
  const anomalies = listAnomalies(now).filter((a) => a.sessionId === id && a.status === "OPEN");
  const expectedTotal =
    view.session.counters.expected + view.session.counters.present + view.session.counters.absent + view.session.counters.excused + view.session.counters.left;
  const locked = view.session.status === "CLOSED";

  return (
    <div className="space-y-6">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Sun’s Horizons · {formatDateLong(now)}</p>
        <div className="mt-1 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{view.session.groupName}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              {view.session.ageRange} · {view.session.location} · {formatTime(view.session.startsAt)} – {formatTime(view.session.endsAt)} ·{" "}
              {STATUS_LABEL[view.session.status]}
            </p>
            <p className="mt-1 text-sm text-[var(--muted)]">Moniteur : {view.session.monitorNames.join(", ")}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/sessions/${id}/history`}
              className="h-10 rounded-lg border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)] flex items-center"
            >
              Historique
            </Link>
            {!locked ? <ClosureControl sessionId={id} expectedTotal={expectedTotal} departedTotal={view.session.counters.left} /> : null}
          </div>
        </div>
      </div>

      {anomalies.length > 0 ? (
        <div className="space-y-2">
          {anomalies.map((anomaly) => (
            <div key={anomaly.id} role="alert" className="flex items-start gap-3 rounded-xl bg-[#fdf1de] px-4 py-3 text-sm font-medium text-[#8a5a12]">
              <span aria-hidden="true">⚠️</span>
              <span>{anomaly.description}</span>
            </div>
          ))}
        </div>
      ) : null}

      <section aria-label="Compteurs" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <CounterStat value={expectedTotal} label="Attendus" />
        <CounterStat value={view.session.counters.present} label="Présents" tone="success" />
        <CounterStat value={view.session.counters.absent} label="Absents" tone="danger" />
        <CounterStat value={view.session.counters.late} label="En retard" tone="warning" />
        <CounterStat value={view.session.counters.expected} label="À traiter" tone="primary" />
      </section>

      <Card>
        <CardContent className="p-0">
          <ul>
            {view.participants.map((participant) => (
              <RosterRow key={participant.id} sessionId={id} participant={participant} locked={locked} />
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
