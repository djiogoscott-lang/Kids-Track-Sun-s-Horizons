import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { ActivityIcon, activityStyle } from "@/features/presence/ui/activity-icons";
import type { ActivityOverview } from "@/features/presence/application/queries";

export function ActivityCard({ activity }: { activity: ActivityOverview }) {
  const style = activityStyle(activity.id);

  return (
    <Link href={`/activities/${activity.id}`} className="tap-scale block h-full">
      <Card className="group h-full transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(16,33,62,0.06),0_20px_40px_-16px_rgba(16,33,62,0.22)]">
        <CardContent className="flex h-full flex-col p-5">
          <div className="flex items-start justify-between">
            <span
              className="flex h-12 w-12 items-center justify-center rounded-2xl"
              style={{ backgroundColor: style.bg, color: style.color }}
            >
              <ActivityIcon activityId={activity.id} size={24} strokeWidth={2} />
            </span>
            {activity.closed ? (
              <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">✓ Clôturée</span>
            ) : null}
          </div>

          <p className="font-heading mt-4 text-lg font-bold uppercase tracking-wide text-[var(--foreground)]">{activity.name}</p>
          <p className="text-sm text-[var(--muted)]">{activity.monitorName}</p>

          <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-semibold text-[var(--foreground)]">{activity.total} enfants</span>
            <span className="flex items-center gap-1 text-[var(--success)]">
              <span aria-hidden="true">🟢</span>
              {activity.arrivedCount} présents
            </span>
            <span className="flex items-center gap-1 text-[var(--danger)]">
              <span aria-hidden="true">🔴</span>
              {activity.absentCount}
            </span>
            {activity.notMarkedCount > 0 ? (
              <span className="flex items-center gap-1 text-[var(--primary)]">
                <span aria-hidden="true">⚪</span>
                {activity.notMarkedCount} à traiter
              </span>
            ) : null}
          </div>

          <div className="mt-4 flex flex-1 items-end">
            <span className="inline-flex items-center gap-1 text-sm font-semibold text-[var(--primary)]">
              Voir la présence
              <ArrowRight size={15} className="transition-transform group-hover:translate-x-0.5" />
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
