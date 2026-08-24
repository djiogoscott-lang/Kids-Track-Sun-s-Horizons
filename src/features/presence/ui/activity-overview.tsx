import { DoorOpen, Home } from "lucide-react";
import { getDaycareList, type ActivityDetail } from "@/features/presence/application/queries";
import { NotificationOverviewCard } from "@/features/notifications/notification-overview-card";
import { ActivityIcon, activityStyle } from "@/features/presence/ui/activity-icons";
import { DayStatusBar } from "@/features/presence/ui/day-status-bar";
import { OverviewCard } from "@/features/presence/ui/overview-card";
import { formatDateLong } from "@/lib/format";

export function ActivityOverview({ activityId, activity, now }: { activityId: string; activity: ActivityDetail; now: Date }) {
  const style = activityStyle(activityId);
  const daycare = getDaycareList(now);
  const daycarePlanned = daycare.filter((c) => c.reason === "PLANNED").length;
  const daycareAfterSession = daycare.filter((c) => c.reason === "AFTER_SESSION").length;

  return (
    <div className="space-y-5">
      <div>
        <p className="text-sm text-[var(--muted)]">{formatDateLong(now)}</p>
        <DayStatusBar now={now} />
      </div>

      <OverviewCard
        href={`/activities/${activityId}?tab=morning`}
        icon={<ActivityIcon activityId={activityId} size={24} strokeWidth={2} />}
        iconColor={style.color}
        iconBg={style.bg}
        title="Présence du jour"
        headline={`${activity.morningCounters.total} enfants`}
        stats={
          <>
            <span className="text-[var(--success)]">🟢 {activity.morningCounters.arrivedCount} arrivés</span> ·{" "}
            <span className="text-[var(--danger)]">🔴 {activity.morningCounters.absentCount} absents</span>
          </>
        }
        cta="Voir la présence"
        tourId="presence-card"
      />

      <OverviewCard
        href={`/activities/${activityId}?tab=evening`}
        icon={<DoorOpen size={24} strokeWidth={2} />}
        iconColor="var(--brand-gold)"
        iconBg="var(--warning-bg)"
        title="Départs"
        headline={`${activity.eveningCounters.presentTotal} présents`}
        stats={
          <>
            <span className="text-[var(--success)]">🟢 {activity.eveningCounters.leftCount} partis</span> ·{" "}
            <span className="text-[#8a5a12]">🟠 {activity.eveningCounters.stillPresentCount} encore présents</span>
          </>
        }
        cta="Gérer les départs"
        tourId="departures-card"
      />

      <OverviewCard
        href="/garderie"
        icon={<Home size={24} strokeWidth={2} />}
        iconColor="var(--brand-blue)"
        iconBg="var(--tint-blue-bg)"
        title="Garderie"
        headline={`${daycare.length} enfant${daycare.length > 1 ? "s" : ""}`}
        stats={
          <>
            <span style={{ color: "var(--brand-gold)" }}>🟠 {daycarePlanned} arrivés automatiquement</span> ·{" "}
            <span style={{ color: "#8a6d12" }}>🟡 {daycareAfterSession} issus des départs</span>
          </>
        }
        cta="Voir la garderie"
        tourId="garderie-card"
      />

      <NotificationOverviewCard />
    </div>
  );
}
