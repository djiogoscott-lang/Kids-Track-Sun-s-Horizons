"use client";

import { Bell, ClipboardCheck, DoorOpen, Home, House } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useNotifications } from "@/features/notifications/notifications-provider";
import { cn } from "@/lib/utils";

interface Tab {
  href: string;
  label: string;
  icon: typeof Home;
  match: (pathname: string, tab: string | null) => boolean;
}

export function MonitorTabBar({ activityId }: { activityId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { unreadCount } = useNotifications();
  const currentTab = searchParams.get("tab");
  const onActivity = pathname === `/activities/${activityId}`;

  const tabs: Tab[] = [
    { href: `/activities/${activityId}`, label: "Accueil", icon: House, match: () => onActivity && !currentTab },
    {
      href: `/activities/${activityId}?tab=morning`,
      label: "Présences",
      icon: ClipboardCheck,
      match: () => onActivity && currentTab === "morning",
    },
    {
      href: `/activities/${activityId}?tab=evening`,
      label: "Départs",
      icon: DoorOpen,
      match: () => onActivity && currentTab === "evening",
    },
    { href: "/garderie", label: "Garderie", icon: Home, match: (p) => p === "/garderie" },
    { href: "/notifications", label: "Notifications", icon: Bell, match: (p) => p === "/notifications" },
  ];

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--border)] bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      aria-label="Navigation principale"
    >
      <div className="mx-auto flex max-w-6xl">
        {tabs.map((tab) => {
          const active = tab.match(pathname, currentTab);
          const Icon = tab.icon;
          return (
            <Link
              key={tab.label}
              href={tab.href}
              data-tour={tab.label === "Notifications" ? "notifications-tab" : undefined}
              className="tap-scale flex flex-1 flex-col items-center gap-1 py-2.5 text-[11px] font-semibold"
              style={{ color: active ? "var(--primary)" : "var(--muted)" }}
            >
              <span className="relative">
                <Icon size={21} strokeWidth={active ? 2.4 : 2} className={cn(active && "drop-shadow-[0_0_0_var(--primary)]")} />
                {tab.label === "Notifications" && unreadCount > 0 ? (
                  <span className="absolute -right-2 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[10px] font-bold leading-none text-white animate-fade-in">
                    {unreadCount > 9 ? "9+" : unreadCount}
                  </span>
                ) : null}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
