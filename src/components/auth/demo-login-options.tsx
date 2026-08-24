import { ArrowRight } from "lucide-react";
import { getActivityIdForMonitor } from "@/features/presence/application/queries";
import { activityStyle } from "@/features/presence/ui/activity-icons";
import { signInDemoAction } from "@/lib/auth/actions";
import { ACTIVITIES, DEMO_USERS } from "@/server/demo/data";

function activityFor(userId: string) {
  const activityId = getActivityIdForMonitor(userId);
  return ACTIVITIES.find((a) => a.id === activityId);
}

export function DemoLoginOptions() {
  return (
    <div className="space-y-2.5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Démonstration — sans configuration
      </p>
      {DEMO_USERS.map((user) => {
        const activity = user.role === "MONITOR" ? activityFor(user.id) : null;
        const style = activity ? activityStyle(activity.id) : { color: "var(--primary)", bg: "var(--tint-blue-bg)" };

        return (
          <form key={user.id} action={signInDemoAction.bind(null, user.id)}>
            <button
              type="submit"
              className="tap-scale group flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 text-left transition hover:border-[var(--primary)]"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{ backgroundColor: style.bg, color: style.color }}
              >
                {user.role === "ADMIN" ? "A" : user.name.replace("Moniteur ", "")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">{user.name}</span>
                <span className="block truncate text-xs text-[var(--muted)]">
                  {user.role === "ADMIN" ? "Vue d'ensemble des 4 activités" : `Appel et départ — ${activity?.name ?? ""}`}
                </span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
            </button>
          </form>
        );
      })}
    </div>
  );
}
