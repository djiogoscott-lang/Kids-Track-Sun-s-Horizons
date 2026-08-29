import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { getWeekSummary } from "@/features/presence/application/history-queries";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong, parseDateKey, toDateKey } from "@/lib/format";

/** Monday of the week containing `date`. */
function mondayOf(date: Date): Date {
  const d = new Date(date);
  const day = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Brussels", weekday: "short" }).format(d);
  const offsets: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
  d.setDate(d.getDate() - (offsets[day] ?? 0));
  return d;
}

function shiftDate(dateKey: string, days: number): string {
  const d = new Date(`${dateKey}T12:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
}

export default async function AdminHistoryWeekPage({ searchParams }: { searchParams: Promise<{ start?: string }> }) {
  await requireUser("ADMIN");
  const { start } = await searchParams;
  const monday = mondayOf(parseDateKey(start));
  const mondayKey = toDateKey(monday);
  const friday = new Date(monday);
  friday.setDate(friday.getDate() + 4);

  const days = await getWeekSummary(monday);
  const todayKey = toDateKey(new Date());
  const thisWeekMondayKey = toDateKey(mondayOf(new Date()));

  return (
    <div className="animate-float-in space-y-6">
      <div>
        <Link href={`/admin/history?date=${mondayKey}`} className="text-sm font-semibold text-[var(--primary)]">
          ← Vue jour
        </Link>
        <h1 className="font-heading mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
          Semaine du {formatDateLong(monday)} au {formatDateLong(friday)}
        </h1>
      </div>

      <div className="flex items-center justify-between gap-2 rounded-2xl border border-[var(--border)] bg-white p-2">
        <Link href={`/admin/history/week?start=${shiftDate(mondayKey, -7)}`} className="tap-scale flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] hover:bg-[var(--background)]" aria-label="Semaine précédente">
          <ChevronLeft size={20} />
        </Link>
        {mondayKey !== thisWeekMondayKey ? (
          <Link href={`/admin/history/week?start=${thisWeekMondayKey}`} className="text-xs font-semibold text-[var(--primary)]">
            Semaine en cours
          </Link>
        ) : (
          <span className="text-xs font-semibold text-[var(--muted)]">Semaine en cours</span>
        )}
        <Link href={`/admin/history/week?start=${shiftDate(mondayKey, 7)}`} className="tap-scale flex h-11 w-11 items-center justify-center rounded-xl text-[var(--foreground)] hover:bg-[var(--background)]" aria-label="Semaine suivante">
          <ChevronRight size={20} />
        </Link>
      </div>

      <div className="space-y-3">
        {days.map((day) => {
          const dayDate = new Date(`${day.date}T12:00:00`);
          const isToday = day.date === todayKey;
          return (
            <Link key={day.date} href={`/admin/history?date=${day.date}`} className="tap-scale block">
              <Card className={isToday ? "border-[var(--primary)]" : undefined}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <p className="font-heading text-base font-bold text-[var(--foreground)]">{formatDateLong(dayDate)}</p>
                    <span className="text-sm font-semibold text-[var(--primary)]">Voir la journée →</span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    {!day.hasSession ? (
                      <span className="text-[var(--muted)]">Aucune séance enregistrée.</span>
                    ) : (
                      <>
                        <span className="text-[var(--success)]">🟢 {day.arrivedCount} présents</span>
                        <span className="text-[var(--danger)]">🔴 {day.absentCount} absents</span>
                        <span className="text-[var(--brand-blue)]">🔵 {day.leftCount} partis</span>
                        <span className="text-[var(--brand-gold)]">🟠 {day.garderieCount} garderie</span>
                        {day.notMarkedCount > 0 ? <span className="text-[var(--primary)]">⚪ {day.notMarkedCount} à traiter</span> : null}
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
