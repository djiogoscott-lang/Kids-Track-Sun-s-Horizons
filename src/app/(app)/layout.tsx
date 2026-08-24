import Link from "next/link";
import { redirect } from "next/navigation";
import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { getActivityIdForMonitor } from "@/features/presence/application/queries";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

const ADMIN_LINKS = [
  { href: "/admin/dashboard", label: "Tableau de bord" },
  { href: "/admin/children", label: "Enfants" },
  { href: "/activities", label: "Activités" },
  { href: "/admin/monitors", label: "Moniteurs" },
  { href: "/garderie", label: "Garderie" },
  { href: "/admin/notifications", label: "Notifications" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const monitorActivityId = user.role === "MONITOR" ? getActivityIdForMonitor(user.id) : null;
  const links =
    user.role === "ADMIN"
      ? ADMIN_LINKS
      : [
          { href: `/activities/${monitorActivityId}?tab=morning`, label: "Présences" },
          { href: `/activities/${monitorActivityId}?tab=evening`, label: "Départs" },
          { href: "/garderie", label: "Garderie" },
          { href: "/notifications", label: "Notifications" },
        ];

  return (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <SunsHorizonsMark className="h-8 w-8" />
            <div className="leading-tight">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">Sun’s Horizons</p>
              <p className="text-sm font-semibold text-[var(--foreground)]">Kids Track</p>
            </div>
          </div>

          <nav className="hidden items-center gap-1 sm:flex" aria-label="Navigation principale">
            {links.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              >
                {link.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-3">
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold text-[var(--foreground)]">{user.name}</p>
              <p className="text-xs text-[var(--muted)]">{user.role === "ADMIN" ? "Administrateur" : "Moniteur"}</p>
            </div>
            <form action={signOutAction}>
              <button
                type="submit"
                className="h-9 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--muted)] transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
              >
                Déconnexion
              </button>
            </form>
          </div>
        </div>
        <nav className="flex items-center gap-1 overflow-x-auto border-t border-[var(--border)] px-4 py-2 sm:hidden" aria-label="Navigation principale">
          {links.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
