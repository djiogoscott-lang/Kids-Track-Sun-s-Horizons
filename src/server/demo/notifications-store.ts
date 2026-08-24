import { EventEmitter } from "node:events";

export interface Notification {
  id: string;
  activityId: string;
  message: string;
  createdAt: Date;
  createdBy: string;
  read: boolean;
  readAt: Date | null;
}

export type NotificationEvent = { type: "new"; notification: Notification } | { type: "read"; activityId: string };

const globalForNotifications = globalThis as unknown as { __ktNotifications?: Notification[]; __ktNotificationBus?: EventEmitter };

function store(): Notification[] {
  if (!globalForNotifications.__ktNotifications) {
    globalForNotifications.__ktNotifications = [];
  }
  return globalForNotifications.__ktNotifications;
}

// One shared in-memory event bus, keyed by activity id as the event name —
// each SSE connection subscribes to the one activity its monitor is on.
function bus(): EventEmitter {
  if (!globalForNotifications.__ktNotificationBus) {
    const emitter = new EventEmitter();
    emitter.setMaxListeners(100);
    globalForNotifications.__ktNotificationBus = emitter;
  }
  return globalForNotifications.__ktNotificationBus;
}

export function subscribeToActivity(activityId: string, listener: (event: NotificationEvent) => void): () => void {
  bus().on(activityId, listener);
  return () => bus().off(activityId, listener);
}

export function getNotificationsForActivity(activityId: string): Notification[] {
  return store()
    .filter((n) => n.activityId === activityId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getUnreadCountForActivity(activityId: string): number {
  return store().filter((n) => n.activityId === activityId && !n.read).length;
}

export function getAllNotifications(): Notification[] {
  return [...store()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

let nextId = 1;

export function addNotification(activityId: string, message: string, createdBy: string, now = new Date()): Notification {
  const notification: Notification = { id: `notif-${nextId++}`, activityId, message, createdAt: now, createdBy, read: false, readAt: null };
  store().push(notification);
  bus().emit(activityId, { type: "new", notification } satisfies NotificationEvent);
  return notification;
}

export function markActivityNotificationsRead(activityId: string, now = new Date()): void {
  let changed = false;
  for (const notification of store()) {
    if (notification.activityId === activityId && !notification.read) {
      notification.read = true;
      notification.readAt = now;
      changed = true;
    }
  }
  if (changed) bus().emit(activityId, { type: "read", activityId } satisfies NotificationEvent);
}
