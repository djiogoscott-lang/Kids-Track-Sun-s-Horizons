import { Bell, ClipboardCheck, DoorOpen, Home, Shuffle, Trophy, Users2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { MonitorTabBar } from "@/components/layout/monitor-tab-bar";
import { NotificationsProvider } from "@/features/notifications/notifications-provider";
import { getActivityIdForMonitor, getNotificationsForMonitor } from "@/features/presence/application/queries";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";

const ADMIN_LINKS = [
  { href: "/admin/children", label: "Enfants", icon: Users2 },
  { href: "/activities", label: "Activités", icon: Trophy },
  { href: "/admin/monitors", label: "Moniteurs", icon: Shuffle },
  { href: "/admin/presences", label: "Présences", icon: ClipboardCheck },
  { href: "/admin/departures", label: "Départs", icon: DoorOpen },
  { href: "/garderie", label: "Garderie", icon: Home },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const monitorActivityId = user.role === "MONITOR" ? getActivityIdForMonitor(user.id) : null;
  const initialNotifications =
    user.role === "MONITOR" && monitorActivityId
      ? getNotificationsForMonitor(monitorActivityId).map((n) => ({
          id: n.id,
          message: n.message,
          createdAt: n.createdAt,
          createdBy: n.createdBy,
          read: n.read,
        }))
      : [];

  const shell = (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <SunsHorizonsMark className="h-10 w-10" />
            <p className="font-heading hidden text-sm font-bold text-[var(--foreground)] sm:block">Kids Track</p>
          </div>

          {user.role === "ADMIN" ? (
            <nav className="hidden items-center gap-1 sm:flex" aria-label="Navigation principale">
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                >
                  <link.icon size={16} />
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}

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
        {user.role === "ADMIN" ? (
          <nav className="flex items-center gap-1 overflow-x-auto border-t border-[var(--border)] px-4 py-2 sm:hidden" aria-label="Navigation principale">
            {ADMIN_LINKS.map((link) => (
              <Link
                key={link.label}
                href={link.href}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium text-[var(--muted)] hover:bg-[var(--background)] hover:text-[var(--foreground)]"
              >
                <link.icon size={15} />
                {link.label}
              </Link>
            ))}
          </nav>
        ) : null}
      </header>
      <main className={`mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8 ${user.role === "MONITOR" ? "pb-24" : ""}`}>{children}</main>
      {user.role === "MONITOR" && monitorActivityId ? (
        <Suspense fallback={null}>
          <MonitorTabBar activityId={monitorActivityId} />
        </Suspense>
      ) : null}
    </div>
  );

  if (user.role === "MONITOR") {
    return <NotificationsProvider initialNotifications={initialNotifications}>{shell}</NotificationsProvider>;
  }
  return shell;
}
