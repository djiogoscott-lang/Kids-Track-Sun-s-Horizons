"use client";

import Link from "next/link";
import { ArrowRight, Bell } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { useNotifications } from "@/features/notifications/notifications-provider";

export function NotificationOverviewCard() {
  const { unreadCount } = useNotifications();

  return (
    <Link href="/notifications" className="tap-scale block" data-tour="notifications-card">
      <Card className="transition-all hover:-translate-y-0.5 hover:shadow-[0_4px_10px_rgba(16,33,62,0.06),0_20px_40px_-16px_rgba(16,33,62,0.22)]">
        <CardContent className="p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--tint-blue-bg)] text-[var(--brand-blue)]">
              <Bell size={24} strokeWidth={2} />
              {unreadCount > 0 ? (
                <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--danger)] px-1 text-[11px] font-bold text-white animate-fade-in">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              ) : null}
            </span>
            <p className="font-heading text-lg font-bold uppercase tracking-wide text-[var(--foreground)]">Notifications</p>
          </div>

          <p className="mt-4 text-3xl font-extrabold text-[var(--foreground)]">
            {unreadCount === 0 ? "Aucun" : unreadCount}
          </p>
          <p className="mt-1 text-sm font-medium text-[var(--muted)]">
            {unreadCount === 0 ? "nouveau message" : unreadCount > 1 ? "nouveaux messages" : "nouveau message"}
          </p>

          <div className="mt-4 flex items-center gap-1 text-sm font-bold text-[var(--brand-blue)]">
            Voir les notifications
            <ArrowRight size={16} />
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
