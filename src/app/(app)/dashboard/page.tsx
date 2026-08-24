import Link from "next/link";
import { getDashboardSummary, listAnomalies } from "@/features/attendance/application/queries";
import { CounterStat } from "@/features/attendance/ui/counter-stat";
import { SessionCard } from "@/features/attendance/ui/session-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong } from "@/lib/format";

export default async function DashboardPage() {
  const user = await requireUser("ADMIN");
  const now = new Date();
  const summary = getDashboardSummary(now);
  const anomalies = listAnomalies(now).filter((a) => a.status === "OPEN");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Bonjour {user.name.split(" ")[0]} 👋</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{formatDateLong(now)}</p>
      </div>

      <section aria-label="Chiffres du jour" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CounterStat value={summary.totals.expected + summary.totals.present + summary.totals.absent + summary.totals.excused + summary.totals.left} label="Enfants attendus" />
        <CounterStat value={summary.totals.present} label="Présents" tone="success" />
        <CounterStat value={summary.totals.absent} label="Absents" tone="danger" />
        <CounterStat value={summary.totals.late} label="Retards" tone="warning" />
      </section>

      <section aria-label="Activité" className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <CounterStat value={summary.activeSessionsCount} label="Séances actives" tone="primary" />
        <CounterStat value={summary.totalSessionsCount} label="Séances aujourd'hui" />
        <CounterStat value={anomalies.length} label="Anomalies" tone={anomalies.length > 0 ? "danger" : "default"} />
        <CounterStat value={summary.totals.toProcess} label="À traiter" />
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Anomalies</h2>
          {anomalies.length > 0 ? (
            <Link href="/anomalies" className="text-sm font-semibold text-[var(--primary)] hover:underline">
              Tout voir
            </Link>
          ) : null}
        </div>
        {anomalies.length === 0 ? (
          <EmptyState icon="👌" title="Aucune anomalie." description="Tout est en ordre." />
        ) : (
          <Card>
            <CardContent className="divide-y divide-[var(--border)] p-0">
              {anomalies.slice(0, 3).map((anomaly) => (
                <div key={anomaly.id} className="flex items-start gap-3 px-5 py-3">
                  <span aria-hidden="true">⚠️</span>
                  <div>
                    <p className="text-sm font-medium text-[var(--foreground)]">{anomaly.description}</p>
                    <p className="text-xs text-[var(--muted)]">{anomaly.sessionLabel}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        )}
      </section>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Séances du jour</h2>
          <Link href="/sessions" className="text-sm font-semibold text-[var(--primary)] hover:underline">
            Tout voir
          </Link>
        </div>
        {summary.sessions.length === 0 ? (
          <EmptyState title="Aucune séance aujourd'hui." description="Vous êtes à jour 👌" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {summary.sessions.map((session) => (
              <SessionCard key={session.id} session={session} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
