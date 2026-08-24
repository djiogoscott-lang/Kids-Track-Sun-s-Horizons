import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { getDashboardSummary } from "@/features/presence/application/queries";
import { CounterBar } from "@/features/presence/ui/counter-bar";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong } from "@/lib/format";

export default async function AdminDashboardPage() {
  const user = await requireUser("ADMIN");
  const now = new Date();
  const summary = getDashboardSummary(now);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Bonjour {user.name} 👋</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{formatDateLong(now)}</p>
      </div>

      <CounterBar
        items={[
          { value: summary.childrenToday, label: "Enfants aujourd'hui" },
          { value: summary.presentCount, label: "Présents", tone: "success" },
          { value: summary.absentCount, label: "Absents", tone: "danger" },
          { value: summary.daycareCount, label: "En garderie", tone: "primary" },
        ]}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-bold text-[var(--foreground)]">Activités</h2>
          <Link href="/activities" className="text-sm font-semibold text-[var(--primary)] hover:underline">
            Tout voir
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {summary.activities.map((activity) => (
            <Card key={activity.id}>
              <CardHeader>
                <p className="font-semibold text-[var(--foreground)]">{activity.name}</p>
                <p className="text-xs text-[var(--muted)]">{activity.monitorName}</p>
              </CardHeader>
              <CardContent className="text-sm">
                <p>{activity.total} enfants</p>
                {activity.closed ? <p className="mt-1 text-xs font-semibold text-[var(--muted)]">✓ Clôturée</p> : null}
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-3">
        <Link href="/garderie">
          <Card className="h-full transition hover:border-[var(--primary)] hover:shadow-md">
            <CardContent className="p-5">
              <p className="font-semibold text-[var(--foreground)]">🏠 Garderie</p>
              <p className="mt-1 text-sm text-[var(--muted)]">{summary.daycareCount} enfant{summary.daycareCount > 1 ? "s" : ""} actuellement présents</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/children">
          <Card className="h-full transition hover:border-[var(--primary)] hover:shadow-md">
            <CardContent className="p-5">
              <p className="font-semibold text-[var(--foreground)]">🧒 Enfants</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Ajouter, modifier, désactiver</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/admin/notifications">
          <Card className="h-full transition hover:border-[var(--primary)] hover:shadow-md">
            <CardContent className="p-5">
              <p className="font-semibold text-[var(--foreground)]">📢 Notifications</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Informer un moniteur</p>
            </CardContent>
          </Card>
        </Link>
      </section>
    </div>
  );
}
