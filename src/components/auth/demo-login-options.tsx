import { signInDemoAction } from "@/lib/auth/actions";
import { getDemoState } from "@/server/demo/store";

const FEATURED_DEMO_USER_IDS = ["user-admin", "user-monitor-1"];

const ROLE_LABEL: Record<string, string> = {
  ADMIN: "Administrateur",
  MONITOR: "Monitrice",
};

const ROLE_DESCRIPTION: Record<string, string> = {
  ADMIN: "Vision globale, séances, anomalies et historique.",
  MONITOR: "Ses séances du jour et la feuille de présence.",
};

export function DemoLoginOptions() {
  const users = getDemoState().users.filter((user) => FEATURED_DEMO_USER_IDS.includes(user.id));

  return (
    <div className="space-y-3">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">
        Démonstration — sans configuration
      </p>
      {users.map((user) => (
        <form key={user.id} action={signInDemoAction.bind(null, user.id)}>
          <button
            type="submit"
            className="flex w-full items-center justify-between rounded-xl border border-[var(--border)] bg-white px-4 py-3 text-left transition hover:border-[var(--primary)] hover:bg-[color-mix(in_srgb,var(--primary)_6%,white)]"
          >
            <span>
              <span className="block text-sm font-semibold text-[var(--foreground)]">{user.name}</span>
              <span className="block text-xs text-[var(--muted)]">{ROLE_DESCRIPTION[user.role]}</span>
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
