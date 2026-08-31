import { Bell, ClipboardCheck, ClipboardList, DoorOpen, History, Home, School, Settings, Shuffle, Trophy, Users2 } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { SunsHorizonsMark } from "@/components/brand/suns-horizons-mark";
import { MonitorTabBar } from "@/components/layout/monitor-tab-bar";
import { HelpMenu } from "@/features/onboarding/help-menu";
import { OnboardingProvider } from "@/features/onboarding/onboarding-provider";
import { ADMIN_STEPS, MONITOR_STEPS } from "@/features/onboarding/steps";
import { NotificationsProvider } from "@/features/notifications/notifications-provider";
import { getActivityIdForMonitor, getAllNotificationsForAdmin, getNotificationsForMonitor } from "@/features/presence/application/queries";
import { AdminLiveSync } from "@/features/presence/ui/admin-live-sync";
import { SchoolSwitcher } from "@/features/schools/school-switcher";
import { signOutAction } from "@/lib/auth/actions";
import { getCurrentUser } from "@/lib/auth/session";
import { getActiveSchoolId, getUserSchools } from "@/lib/schools/context";

const ADMIN_LINKS = [
  { href: "/admin/children", label: "Enfants", icon: Users2, tourId: "nav-children" },
  { href: "/admin/roster", label: "Participants", icon: ClipboardList },
  { href: "/activities", label: "Activités", icon: Trophy },
  { href: "/admin/monitors", label: "Moniteurs", icon: Shuffle, tourId: "nav-monitors" },
  { href: "/admin/activities", label: "Gestion activités", icon: Settings },
  { href: "/admin/schools", label: "Écoles", icon: School },
  { href: "/admin/presences", label: "Présences", icon: ClipboardCheck, tourId: "nav-presences" },
  { href: "/admin/departures", label: "Départs", icon: DoorOpen },
  { href: "/garderie", label: "Garderie", icon: Home, tourId: "nav-garderie" },
  { href: "/admin/notifications", label: "Notifications", icon: Bell },
  { href: "/admin/history", label: "Historique", icon: History },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const [userSchools, activeSchoolId] = await Promise.all([getUserSchools(), getActiveSchoolId()]);
  const schoolOptions = userSchools.map((s) => ({ schoolId: s.schoolId, name: s.name, active: s.active }));

  const monitorActivityId = user.role === "MONITOR" ? await getActivityIdForMonitor(user.id) : null;
  const rawNotifications =
    user.role === "ADMIN"
      ? await getAllNotificationsForAdmin()
      : monitorActivityId
        ? await getNotificationsForMonitor(monitorActivityId)
        : [];
  const initialNotifications = rawNotifications.map((n) => ({
    id: n.id,
    message: n.message,
    createdAt: n.createdAt,
    createdBy: n.createdBy,
    read: n.read,
  }));

  const shell = (
    <div className="min-h-screen bg-[var(--background)]">
      <header className="border-b border-[var(--border)] bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <SunsHorizonsMark className="h-10 w-10" />
            <p className="font-heading hidden text-sm font-bold text-[var(--foreground)] sm:block">Kids Track</p>
          </div>

          {user.role === "ADMIN" ? (
            <nav
              // flex-wrap, and min-w-0 so the nav may actually shrink: as
              // entries were added (Écoles came with multi-school) the row
              // grew past 1237px and pushed the page 120px wider than a
              // 1280px window, leaving every screen horizontally scrollable
              // and the last entry hanging off the edge. Wrapping keeps every
              // entry reachable instead of hiding or truncating any.
              className="hidden min-w-0 flex-wrap items-center justify-center gap-1 sm:flex"
              aria-label="Navigation principale"
            >
              {ADMIN_LINKS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  data-tour={link.tourId}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-[var(--muted)] transition hover:bg-[var(--background)] hover:text-[var(--foreground)]"
                >
                  <link.icon size={16} />
                  {link.label}
                </Link>
              ))}
            </nav>
          ) : null}

          <div className="flex items-center gap-3">
            {/* Renders nothing for a user with a single school — see the
                component. Everything on screen is scoped to whichever school
                is selected here. */}
            <SchoolSwitcher schools={schoolOptions} activeSchoolId={activeSchoolId} />
            <div className="hidden text-right leading-tight sm:block">
              <p className="text-sm font-semibold text-[var(--foreground)]">{user.name}</p>
              <p className="text-xs text-[var(--muted)]">{user.role === "ADMIN" ? "Administrateur" : "Moniteur"}</p>
            </div>
            <HelpMenu />
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
                data-tour={link.tourId}
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
      {user.role === "ADMIN" ? <AdminLiveSync /> : null}
      {user.role === "MONITOR" && monitorActivityId ? (
        <Suspense fallback={null}>
          <MonitorTabBar activityId={monitorActivityId} />
        </Suspense>
      ) : null}
    </div>
  );

  const withOnboarding = (
    <OnboardingProvider userId={user.id} steps={user.role === "ADMIN" ? ADMIN_STEPS : MONITOR_STEPS}>
      {shell}
    </OnboardingProvider>
  );

  return (
    <NotificationsProvider initialNotifications={initialNotifications} live={user.role === "MONITOR"}>
      {withOnboarding}
    </NotificationsProvider>
  );
}
