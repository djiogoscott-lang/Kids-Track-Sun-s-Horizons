import { ArrowRight } from "lucide-react";
import { signInDemoAction } from "@/lib/auth/actions";
import { listSignInAccounts } from "@/lib/auth/sign-in-accounts";

/**
 * Passwordless sign-in, local only (see sign-in-accounts.ts and
 * signInDemoAction, which refuses outright once real auth is on).
 *
 * The cards are built from whatever accounts actually exist — real ones when
 * Supabase holds the data — instead of a fixed demo cast whose activity names
 * stopped matching reality the moment the school renamed its activities.
 */
export async function DemoLoginOptions() {
  const accounts = await listSignInAccounts();

  return (
    <div className="space-y-2.5">
      <p className="text-center text-xs font-semibold uppercase tracking-[0.14em] text-[var(--muted)]">Connexion locale — sans mot de passe</p>
      {accounts.length === 0 ? (
        <p className="rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 text-sm text-[var(--muted)]">
          Aucun compte n&apos;est rattaché à une école. Ajoutez un membre pour pouvoir vous connecter.
        </p>
      ) : null}
      {accounts.map((user) => {
        const scope =
          user.role === "ADMIN"
            ? user.schoolNames.length > 0
              ? `Administration — ${user.schoolNames.join(", ")}`
              : "Administration"
            : user.activityName
              ? `Appel et départ — ${user.activityName}`
              : "Aucune activité attribuée";

        return (
          <form key={user.id} action={signInDemoAction.bind(null, user.id)}>
            <button
              type="submit"
              className="tap-scale group flex w-full items-center gap-3 rounded-2xl border border-[var(--border)] bg-white px-4 py-3.5 text-left transition hover:border-[var(--primary)]"
            >
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold"
                style={{
                  backgroundColor: user.role === "ADMIN" ? "var(--tint-blue-bg)" : "var(--background)",
                  color: user.role === "ADMIN" ? "var(--primary)" : "var(--foreground)",
                }}
              >
                {user.role === "ADMIN" ? "A" : (user.name.match(/\d+/)?.[0] ?? user.name.slice(0, 1).toUpperCase())}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-semibold text-[var(--foreground)]">{user.name}</span>
                <span className="block truncate text-xs text-[var(--muted)]">{scope}</span>
              </span>
              <ArrowRight size={16} className="shrink-0 text-[var(--muted)] transition-transform group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" />
            </button>
          </form>
        );
      })}
    </div>
  );
}
