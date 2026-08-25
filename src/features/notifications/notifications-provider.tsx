"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { markNotificationsReadAction } from "@/features/presence/ui/actions";

export interface NotificationView {
  id: string;
  message: string;
  createdAt: Date;
  createdBy: string;
  read: boolean;
}

interface NotificationsContextValue {
  notifications: NotificationView[];
  unreadCount: number;
  markAllRead: () => void;
}

const NotificationsContext = createContext<NotificationsContextValue | null>(null);

export function useNotifications(): NotificationsContextValue {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
}

type StreamEvent = { type: "new"; notification: NotificationView } | { type: "read" };

export function NotificationsProvider({
  initialNotifications,
  live = true,
  children,
}: {
  initialNotifications: NotificationView[];
  /** Only monitors have a single assigned activity for /api/notifications/stream to scope to — it 401s anyone else, so admins get the initial snapshot without opening a doomed connection. */
  live?: boolean;
  children: React.ReactNode;
}) {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [toast, setToast] = useState<NotificationView | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!live) return;
    const source = new EventSource("/api/notifications/stream");

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as StreamEvent;
      if (payload.type === "new") {
        const incoming = { ...payload.notification, createdAt: new Date(payload.notification.createdAt) };
        setNotifications((prev) => [incoming, ...prev]);
        setToast(incoming);
        if (toastTimer.current) clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(null), 4500);
      } else if (payload.type === "read") {
        setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      }
    };

    return () => source.close();
  }, [live]);

  const unreadCount = notifications.filter((n) => !n.read).length;

  function markAllRead() {
    if (unreadCount === 0) return;
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    markNotificationsReadAction();
  }

  return (
    <NotificationsContext.Provider value={{ notifications, unreadCount, markAllRead }}>
      {children}
      {toast ? (
        <div
          role="status"
          className="animate-float-in fixed inset-x-4 top-4 z-50 mx-auto max-w-sm rounded-2xl border border-[var(--border)] bg-white p-4 shadow-[0_4px_10px_rgba(16,33,62,0.06),0_20px_40px_-16px_rgba(16,33,62,0.28)] sm:left-auto sm:right-4"
        >
          <button
            type="button"
            onClick={() => setToast(null)}
            className="flex w-full items-start gap-3 text-left"
            aria-label="Fermer la notification"
          >
            <span className="text-xl">🔔</span>
            <span className="min-w-0 flex-1">
              <span className="block text-xs font-bold uppercase tracking-wide text-[var(--primary)]">Nouveau message</span>
              <span className="mt-0.5 block text-sm text-[var(--foreground)]">{toast.message}</span>
            </span>
          </button>
        </div>
      ) : null}
    </NotificationsContext.Provider>
  );
}
