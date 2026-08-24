export interface Notification {
  id: string;
  activityId: string;
  message: string;
  createdAt: Date;
  createdBy: string;
}

const globalForNotifications = globalThis as unknown as { __ktNotifications?: Notification[] };

function store(): Notification[] {
  if (!globalForNotifications.__ktNotifications) {
    globalForNotifications.__ktNotifications = [];
  }
  return globalForNotifications.__ktNotifications;
}

export function getNotificationsForActivity(activityId: string): Notification[] {
  return store()
    .filter((n) => n.activityId === activityId)
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export function getAllNotifications(): Notification[] {
  return [...store()].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

let nextId = 1;

export function addNotification(activityId: string, message: string, createdBy: string, now = new Date()): Notification {
  const notification: Notification = { id: `notif-${nextId++}`, activityId, message, createdAt: now, createdBy };
  store().push(notification);
  return notification;
}
