import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { listAnomalies } from "@/features/attendance/application/queries";
import { ResolveAnomalyButton } from "@/features/attendance/ui/resolve-anomaly-button";
import { requireUser } from "@/lib/auth/require-user";
import { formatTime } from "@/lib/format";

const SEVERITY_STYLE: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600",
  MEDIUM: "bg-[#fdf1de] text-[#8a5a12]",
  HIGH: "bg-[#fdeced] text-[#9c2c39]",
  CRITICAL: "bg-[#fdeced] text-[#9c2c39]",
};

export default async function AnomaliesPage() {
  await requireUser("ADMIN");
  const now = new Date();
  const anomalies = listAnomalies(now);
  const open = anomalies.filter((a) => a.status === "OPEN");
  const resolved = anomalies.filter((a) => a.status === "RESOLVED");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Anomalies</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Ce que le système détecte automatiquement, sans que personne n&apos;ait à le chercher.</p>
      </div>

      {open.length === 0 ? (
        <EmptyState icon="👌" title="Aucune anomalie." description="Tout est en ordre." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-[var(--border)] p-0">
            {open.map((anomaly) => (
              <div key={anomaly.id} className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
                <div className="flex items-start gap-3">
                  <span aria-hidden="true">⚠️</span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEVERITY_STYLE[anomaly.severity]}`}>{anomaly.severity}</span>
                      <p className="text-sm font-medium text-[var(--foreground)]">{anomaly.description}</p>
                    </div>
                    <p className="mt-1 text-xs text-[var(--muted)]">
                      <Link href={`/sessions/${anomaly.sessionId}`} className="font-semibold text-[var(--primary)] hover:underline">
                        {anomaly.sessionLabel}
                      </Link>{" "}
                      · détecté à {formatTime(anomaly.detectedAt)}
                    </p>
                  </div>
                </div>
                {anomaly.resolvable ? <ResolveAnomalyButton anomalyId={anomaly.id} /> : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {resolved.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Résolues</h2>
          <Card>
            <CardContent className="divide-y divide-[var(--border)] p-0">
              {resolved.map((anomaly) => (
                <div key={anomaly.id} className="px-5 py-3 text-sm text-[var(--muted)]">
                  <span className="line-through">{anomaly.description}</span> — {anomaly.sessionLabel}
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      ) : null}
    </div>
  );
}
