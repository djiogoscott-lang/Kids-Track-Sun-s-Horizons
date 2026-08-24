import { describe, expect, it, vi } from "vitest";
import {
  addNotification,
  getNotificationsForActivity,
  getUnreadCountForActivity,
  markActivityNotificationsRead,
  subscribeToActivity,
} from "./notifications-store";

const ACTIVITY_A = `activity-test-a-${Math.random()}`;
const ACTIVITY_B = `activity-test-b-${Math.random()}`;

describe("notifications-store", () => {
  it("starts a new notification unread", () => {
    addNotification(ACTIVITY_A, "Message 1", "Admin");
    expect(getUnreadCountForActivity(ACTIVITY_A)).toBeGreaterThan(0);
  });

  it("counts multiple unread notifications for one activity", () => {
    const activity = `activity-multi-${Math.random()}`;
    addNotification(activity, "Message 1", "Admin");
    addNotification(activity, "Message 2", "Admin");
    expect(getUnreadCountForActivity(activity)).toBe(2);
  });

  it("marking read resets the unread count to zero", () => {
    const activity = `activity-read-${Math.random()}`;
    addNotification(activity, "Message", "Admin");
    expect(getUnreadCountForActivity(activity)).toBe(1);

    markActivityNotificationsRead(activity);
    expect(getUnreadCountForActivity(activity)).toBe(0);
    expect(getNotificationsForActivity(activity).every((n) => n.read)).toBe(true);
  });

  it("does not affect another activity's unread count", () => {
    addNotification(ACTIVITY_A, "For A", "Admin");
    addNotification(ACTIVITY_B, "For B", "Admin");
    markActivityNotificationsRead(ACTIVITY_A);

    expect(getUnreadCountForActivity(ACTIVITY_A)).toBe(0);
    expect(getUnreadCountForActivity(ACTIVITY_B)).toBeGreaterThan(0);
  });

  it("publishes a 'new' event to subscribers of that activity when a notification is added", () => {
    const activity = `activity-sub-${Math.random()}`;
    const listener = vi.fn();
    const unsubscribe = subscribeToActivity(activity, listener);

    addNotification(activity, "Live message", "Admin");

    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: "new" }));
    unsubscribe();
  });

  it("publishes a 'read' event to subscribers when notifications are marked read", () => {
    const activity = `activity-sub-read-${Math.random()}`;
    addNotification(activity, "Message", "Admin");

    const listener = vi.fn();
    const unsubscribe = subscribeToActivity(activity, listener);
    markActivityNotificationsRead(activity);

    expect(listener).toHaveBeenCalledWith({ type: "read", activityId: activity });
    unsubscribe();
  });

  it("stops notifying a listener after it unsubscribes", () => {
    const activity = `activity-unsub-${Math.random()}`;
    const listener = vi.fn();
    const unsubscribe = subscribeToActivity(activity, listener);
    unsubscribe();

    addNotification(activity, "Message", "Admin");
    expect(listener).not.toHaveBeenCalled();
  });
});
