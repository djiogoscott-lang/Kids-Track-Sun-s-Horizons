import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivityDetail } from "@/features/presence/application/queries";
import { getDaySummary } from "@/features/presence/application/history-queries";
import { ActivityIcon, activityStyle } from "@/features/presence/ui/activity-icons";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateWithYear, formatTime, parseDateKey, toDateKey } from "@/lib/format";

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export default async function AdminHistoryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; activity?: string }>;
}) {
  await requireUser("ADMIN");
  const { date: dateParam, activity: activityId } = await searchParams;
  const date = parseDateKey(dateParam);
  const dateKey = toDateKey(date);
  const todayKey = toDateKey(new Date());
  const isToday = dateKey === todayKey;

  if (activityId) {
    const detail = await getActivityDetail(activityId, date);
    if (!detail) {
      return <EmptyState title="Activité introuvable pour cette date." />;
    }
    const style = activityStyle(activityId);

    return (
      <div className="animate-float-in space-y-6">
        <div>
          <Link href={`/admin/history?date=${dateKey}`} className="text-sm font-semibold text-[var(--primary)]">
            ← Toutes les activités
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: style.bg, color: style.color }}>
              <ActivityIcon activityId={activityId} size={24} strokeWidth={2} />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--primary)]">Moniteur : {detail.monitorName}</p>
              <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">{detail.name}</h1>
              <p className="text-sm text-[var(--muted)]">{formatDateWithYear(date)}</p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          <div className="rounded-2xl bg-[var(--success-bg)] px-4 py-3">
            <p className="text-2xl font-extrabold text-[var(--success)]">{detail.morningCounters.arrivedCount}</p>
            <p className="text-xs font-semibold text-[var(--success)]">🟢 Présents</p>
          </div>
          <div className="rounded-2xl bg-red-50 px-4 py-3">
            <p className="text-2xl font-extrabold text-[var(--danger)]">{detail.morningCounters.absentCount}</p>
            <p className="text-xs font-semibold text-[var(--danger)]">🔴 Absents</p>
          </div>
          <div className="rounded-2xl bg-[var(--tint-blue-bg)] px-4 py-3">
            <p className="text-2xl font-extrabold text-[var(--brand-blue)]">{detail.eveningCounters.leftCount}</p>
            <p className="text-xs font-semibold text-[var(--brand-blue)]">🔵 Partis</p>
          </div>
          <div className="rounded-2xl bg-[var(--warning-bg)] px-4 py-3">
            <p className="text-2xl font-extrabold text-[var(--brand-gold)]">{detail.garderieCount}</p>
            <p className="text-xs font-semibold text-[var(--brand-gold)]">🟠 Garderie</p>
          </div>
        </div>

        {!detail.closed ? (
          <p className="rounded-xl bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
            Cette journée n&apos;a pas été clôturée par le moniteur — les statuts « encore présent » ci-dessous n&apos;ont pas basculé automatiquement en garderie.
          </p>
        ) : null}

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--success)]">🟢 Présents ({detail.morningList.filter((c) => c.status === "ARRIVED").length})</h2>
          {detail.morningList.filter((c) => c.status === "ARRIVED").length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucun enfant présent.</p>
          ) : (
            <Card>
              <CardContent className="divide-y divide-[var(--border)] p-0">
                {detail.morningList
                  .filter((c) => c.status === "ARRIVED")
                  .map((child) => {
                    const evening = detail.eveningList.find((e) => e.childId === child.childId);
                    const inGarderie = detail.garderieList.some((g) => g.childId === child.childId);
                    const label = evening?.status === "LEFT" ? "Parti" : inGarderie ? "Garderie" : "Encore présent";
                    return (
                      <div key={child.childId} className="flex items-center justify-between px-5 py-3">
                        <p className="font-semibold text-[var(--foreground)]">
                          {child.firstName} {child.lastName}
                        </p>
                        <p className="text-xs text-[var(--muted)]">{label}</p>
                      </div>
                    );
                  })}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--danger)]">🔴 Absents ({detail.morningList.filter((c) => c.status === "ABSENT").length})</h2>
          {detail.morningList.filter((c) => c.status === "ABSENT").length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Aucun absent.</p>
          ) : (
            <Card>
              <CardContent className="divide-y divide-[var(--border)] p-0">
                {detail.morningList
                  .filter((c) => c.status === "ABSENT")
                  .map((child) => (
                    <div key={child.childId} className="px-5 py-3">
                      <p className="font-semibold text-[var(--foreground)]">
                        {child.firstName} {child.lastName}
                      </p>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-sm font-bold uppercase tracking-wide text-[var(--brand-gold)]">🟠 Garderie ({detail.garderieList.length})</h2>
          {detail.garderieList.length === 0 ? (
            <p className="text-sm text-[var(--muted)]">Personne en garderie.</p>
          ) : (
            <Card>
              <CardContent className="divide-y divide-[var(--border)] p-0">
                {detail.garderieList.map((child) => (
                  <div key={child.childId} className="flex items-center justify-between px-5 py-3">
                    <p className="font-semibold text-[var(--foreground)]">
                      {child.firstName} {child.lastName}
                    </p>
                    <p className="text-xs text-[var(--muted)]">{child.reason === "PLANNED" ? "Garderie prévue" : "Garderie après séance"}</p>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </section>
      </div>
    );
  }

  const summary = await getDaySummary(date);

  return (
    <div className="animate-float-in space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Historique</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Consultez les journées précédentes, activité par activité.</p>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
        <Link href={`/admin/history?date=${shiftDate(dateKey, -1)}`} className="tap-scale flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] hover:bg-[var(--background)]" aria-label="Jour précédent">
          <ChevronLeft size={20} />
        </Link>
        <div className="text-center">
          <p className="text-sm font-bold text-[var(--foreground)]">{formatDateWithYear(date)}</p>
          {!isToday ? (
            <Link href={`/admin/history?date=${todayKey}`} className="text-xs font-semibold text-[var(--primary)]">
              Retour à aujourd&apos;hui
            </Link>
          ) : null}
        </div>
        <Link href={`/admin/history?date=${shiftDate(dateKey, 1)}`} className="tap-scale flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] hover:bg-[var(--background)]" aria-label="Jour suivant">
          <ChevronRight size={20} />
        </Link>
      </div>

      <Link href={`/admin/history/week?start=${dateKey}`} className="block text-sm font-semibold text-[var(--primary)]">
        Voir la vue semaine →
      </Link>

      <div className="space-y-3">
        {summary.map((row) => (
          <Link key={row.activityId} href={`/admin/history?date=${dateKey}&activity=${row.activityId}`} className="tap-scale block">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-heading text-base font-bold uppercase tracking-wide text-[var(--foreground)]">{row.activityName}</p>
                    <p className="text-xs text-[var(--muted)]">
                      {row.monitorName} {row.closed && row.closedAt ? `· clôturée à ${formatTime(row.closedAt)}` : "· non clôturée"}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  <span className="text-[var(--success)]">🟢 {row.arrivedCount} présents</span>
                  <span className="text-[var(--danger)]">🔴 {row.absentCount} absents</span>
                  <span className="text-[var(--brand-blue)]">🔵 {row.leftCount} partis</span>
                  <span className="text-[var(--brand-gold)]">🟠 {row.garderieCount} garderie</span>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
