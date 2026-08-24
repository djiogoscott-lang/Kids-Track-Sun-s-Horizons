import { signInDemoAction } from "@/lib/auth/actions";
import { ACTIVITIES, DEMO_USERS } from "@/server/demo/data";

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  MONITOR: "Moniteur",
};

function description(user: (typeof DEMO_USERS)[number]): string {
  if (user.role === "ADMIN") return "Vue d'ensemble des 4 activités.";
  const activity = ACTIVITIES.find((a) => a.monitorId === user.id);
  return activity ? `Appel et départ — ${activity.name}` : "";
}

export function DemoLoginOptions() {
  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Démonstration — sans configuration
      </p>
      {DEMO_USERS.map((user) => (
        <form key={user.id} action={signInDemoAction.bind(null, user.id)}>
          <button
            type="submit"
            className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left transition hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,white)]"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--foreground)]">{user.name}</span>
              <span className="block text-xs text-[var(--muted)]">{description(user)}</span>
            </span>
            <span className="rounded-full bg-[var(--background)] px-3 py-1 text-xs font-semibold text-[var(--primary)]">
              {ROLE_LABEL[user.role]}
            </span>
          </button>
        </form>
      ))}
    </div>
  );
}
