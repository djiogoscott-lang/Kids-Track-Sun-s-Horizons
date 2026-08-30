"use server";

import { revalidatePath } from "next/cache";
import {
  addChildToDaycare,
  assignMonitor,
  bulkDeleteChildren,
  closeActivityDay,
  createAccount,
  createChild,
  deleteChildPermanently,
  markAbsent,
  markArrived,
  markLeft,
  markNotificationsRead,
  markStillPresent,
  sendNotification,
  setChildActive,
  setMonitorActive,
  updateChild,
  updateMonitorName,
  updateMonitorPassword,
  type UpdateChildInput,
} from "@/features/presence/application/commands";
import { getActivityIdForMonitor, getChildForAdmin } from "@/features/presence/application/queries";
import { PresenceCommandError } from "@/features/presence/application/errors";
import { requireUser } from "@/lib/auth/require-user";
import { publishActivityUpdate } from "@/server/demo/notifications-store";
import type { NewChildRecordInput } from "@/server/data-source";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function assertActivityAccess(activityId: string) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if ((await getActivityIdForMonitor(user.id)) !== activityId) {
    throw new PresenceCommandError("Vous n'avez pas accès à cette activité.");
  }
  return user;
}

async function toResult(fn: () => Promise<unknown>): Promise<ActionResult> {
  try {
    await fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof PresenceCommandError) return { ok: false, message: error.message };
    // An unexpected (non-business) error still gets a friendly message for
    // the user, but must not vanish silently server-side — that's exactly
    // what made an earlier bug here take real debugging effort to find.
    console.error("Unexpected error in a presence action:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

function revalidateActivityViews(activityId: string) {
  revalidatePath(`/activities/${activityId}`);
  revalidatePath("/activities");
  revalidatePath("/garderie");
  revalidatePath("/admin/presences");
  revalidatePath("/admin/departures");
  // Pushes a live nudge to any open admin screen so a monitor's change shows
  // up without a manual reload — same SSE bus already used for notifications.
  publishActivityUpdate(activityId);
}

export async function markArrivedAction(activityId: string, childId: string): Promise<ActionResult> {
  const user = await assertActivityAccess(activityId);
  const result = await toResult(() => markArrived(activityId, childId, user.id));
  revalidateActivityViews(activityId);
  return result;
}

export async function markAbsentAction(activityId: string, childId: string): Promise<ActionResult> {
  const user = await assertActivityAccess(activityId);
  const result = await toResult(() => markAbsent(activityId, childId, user.id));
  revalidateActivityViews(activityId);
  return result;
}

export async function markLeftAction(activityId: string, childId: string): Promise<ActionResult> {
  const user = await assertActivityAccess(activityId);
  const result = await toResult(() => markLeft(activityId, childId, user.id));
  revalidateActivityViews(activityId);
  return result;
}

export async function markStillPresentAction(activityId: string, childId: string): Promise<ActionResult> {
  const user = await assertActivityAccess(activityId);
  const result = await toResult(() => markStillPresent(activityId, childId, user.id));
  revalidateActivityViews(activityId);
  return result;
}

/**
 * Garderie is shared across activities (any monitor may be covering it), so
 * unlike the actions above this only requires being signed in, not owning
 * the child's activity.
 */
export async function markGoneFromDaycareAction(activityId: string, childId: string): Promise<ActionResult> {
  const user = await requireUser();
  const result = await toResult(() => markLeft(activityId, childId, user.id));
  revalidateActivityViews(activityId);
  return result;
}

/**
 * The client only ever sends a childId, never an activityId — the child's
 * real activity is looked up here and is what assertActivityAccess checks a
 * monitor against, so a monitor can never smuggle in another activity's
 * child by any client-side means.
 */
export async function addChildToDaycareAction(childId: string): Promise<ActionResult> {
  const child = await getChildForAdmin(childId);
  if (!child) return { ok: false, message: "Enfant introuvable." };
  const result = await toResult(async () => {
    const user = await assertActivityAccess(child.activityId);
    await addChildToDaycare(childId, user.id);
  });
  revalidateActivityViews(child.activityId);
  return result;
}

export async function closeActivityDayAction(activityId: string): Promise<ActionResult> {
  const user = await assertActivityAccess(activityId);
  const result = await toResult(() => closeActivityDay(activityId, user.id, user.name));
  revalidateActivityViews(activityId);
  return result;
}

export async function createChildAction(input: NewChildRecordInput): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => createChild(input));
  revalidatePath("/admin/children");
  revalidatePath("/activities");
  return result;
}

export async function updateChildAction(childId: string, input: UpdateChildInput): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => updateChild(childId, input));
  revalidatePath("/admin/children");
  revalidatePath("/activities");
  revalidatePath("/garderie");
  return result;
}

export async function setChildActiveAction(childId: string, active: boolean): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => setChildActive(childId, active));
  revalidatePath("/admin/children");
  revalidatePath("/activities");
  return result;
}

export async function deleteChildPermanentlyAction(childId: string, confirmationText: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => deleteChildPermanently(childId, confirmationText));
  revalidatePath("/admin/children");
  revalidatePath("/activities");
  return result;
}

export type BulkDeleteActionResult =
  | { ok: true; deletedCount: number; blockedNames: string[] }
  | { ok: false; message: string };

export async function bulkDeleteChildrenAction(childIds: string[], confirmationText: string): Promise<BulkDeleteActionResult> {
  await requireUser("ADMIN");
  try {
    const result = await bulkDeleteChildren(childIds, confirmationText);
    revalidatePath("/admin/children");
    revalidatePath("/activities");
    return { ok: true, deletedCount: result.deletedCount, blockedNames: result.blockedNames };
  } catch (error) {
    if (error instanceof PresenceCommandError) return { ok: false, message: error.message };
    console.error("Unexpected error in bulk child deletion:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function assignMonitorAction(activityId: string, monitorId: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => assignMonitor(activityId, monitorId));
  revalidatePath("/admin");
  revalidatePath("/activities");
  revalidatePath(`/activities/${activityId}`);
  return result;
}

export async function setMonitorActiveAction(monitorId: string, active: boolean): Promise<ActionResult> {
  const admin = await requireUser("ADMIN");
  const result = await toResult(() => setMonitorActive(monitorId, active, admin.id));
  revalidatePath("/admin/monitors");
  return result;
}

/**
 * Creating an ADMIN account is gated the exact same way as a MONITOR one:
 * requireUser("ADMIN") means only an existing admin can ever reach either
 * branch — there is no separate, weaker check for the ADMIN role case.
 */
export async function createAccountAction(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: "ADMIN" | "MONITOR",
  activityId: string | null,
): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => createAccount(email, password, firstName, lastName, role, activityId));
  revalidatePath("/admin/monitors");
  revalidatePath("/activities");
  return result;
}

export async function updateMonitorNameAction(monitorId: string, fullName: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => updateMonitorName(monitorId, fullName));
  revalidatePath("/admin/monitors");
  return result;
}

export async function updateMonitorPasswordAction(monitorId: string, newPassword: string, confirmPassword: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => updateMonitorPassword(monitorId, newPassword, confirmPassword));
  return result;
}

export async function sendNotificationAction(activityId: string, message: string): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  const result = await toResult(async () => {
    await sendNotification(activityId, message, user.id, user.name);
  });
  revalidatePath("/notifications");
  revalidatePath("/admin/notifications");
  return result;
}

/** Read state is pushed live over realtime; this just persists it server-side. */
export async function markNotificationsReadAction(): Promise<ActionResult> {
  const user = await requireUser("MONITOR");
  const activityId = await getActivityIdForMonitor(user.id);
  if (!activityId) return { ok: false, message: "Aucune activité associée." };
  await markNotificationsRead(activityId);
  revalidatePath("/notifications");
  return { ok: true };
}
