import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { ActivityOverview } from "@/features/presence/application/queries";

export function ActivityCard({ activity }: { activity: ActivityOverview }) {
  return (
    <Link href={`/activities/${activity.id}`} className="block">
      <Card className="h-full transition hover:border-[var(--primary)] hover:shadow-md">
        <CardHeader className="flex items-start justify-between gap-2">
          <div>
            <p className="text-lg font-bold text-[var(--foreground)]">{activity.name}</p>
            <p className="text-sm text-[var(--muted)]">{activity.monitorName}</p>
          </div>
          {activity.closed ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">✓ Clôturée</span>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-1 text-sm">
          <p>
            → <strong className="text-[var(--foreground)]">{activity.total}</strong> enfants
          </p>
          <p className="text-[var(--success)]">
            → <strong>{activity.arrivedCount}</strong> arrivés
          </p>
          <p className="text-[var(--danger)]">
            → <strong>{activity.absentCount}</strong> absent{activity.absentCount > 1 ? "s" : ""}
          </p>
        </CardContent>
      </Card>
    </Link>
  );
}
