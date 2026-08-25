"use server";

import { revalidatePath } from "next/cache";
import {
  assignMonitor,
  closeActivityDay,
  createChild,
  markAbsent,
  markArrived,
  markLeft,
  markNotificationsRead,
  markStillPresent,
  sendNotification,
  setChildActive,
  updateChild,
  type UpdateChildInput,
} from "@/features/presence/application/commands";
import { getActivityIdForMonitor } from "@/features/presence/application/queries";
import { PresenceCommandError } from "@/features/presence/application/errors";
import { requireUser } from "@/lib/auth/require-user";
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
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

function revalidateActivityViews(activityId: string) {
  revalidatePath(`/activities/${activityId}`);
  revalidatePath("/activities");
  revalidatePath("/garderie");
  revalidatePath("/admin/presences");
  revalidatePath("/admin/departures");
}

export async function markArrivedAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = await toResult(() => markArrived(activityId, childId));
  revalidateActivityViews(activityId);
  return result;
}

export async function markAbsentAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = await toResult(() => markAbsent(activityId, childId));
  revalidateActivityViews(activityId);
  return result;
}

export async function markLeftAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = await toResult(() => markLeft(activityId, childId));
  revalidateActivityViews(activityId);
  return result;
}

export async function markStillPresentAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = await toResult(() => markStillPresent(activityId, childId));
  revalidateActivityViews(activityId);
  return result;
}

/**
 * Garderie is shared across activities (any monitor may be covering it), so
 * unlike the actions above this only requires being signed in, not owning
 * the child's activity.
 */
export async function markGoneFromDaycareAction(activityId: string, childId: string): Promise<ActionResult> {
  await requireUser();
  const result = await toResult(() => markLeft(activityId, childId));
  revalidateActivityViews(activityId);
  return result;
}

export async function closeActivityDayAction(activityId: string): Promise<ActionResult> {
  const user = await assertActivityAccess(activityId);
  const result = await toResult(() => closeActivityDay(activityId, user.name));
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

export async function assignMonitorAction(activityId: string, monitorId: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => assignMonitor(activityId, monitorId));
  revalidatePath("/admin");
  revalidatePath("/activities");
  revalidatePath(`/activities/${activityId}`);
  return result;
}

export async function sendNotificationAction(activityId: string, message: string): Promise<ActionResult> {
  const user = await requireUser("ADMIN");
  const result = await toResult(async () => {
    sendNotification(activityId, message, user.name);
  });
  revalidatePath("/notifications");
  revalidatePath("/admin/notifications");
  return result;
}

/** Read state is pushed live over SSE; this just persists it server-side. */
export async function markNotificationsReadAction(): Promise<ActionResult> {
  const user = await requireUser("MONITOR");
  const activityId = await getActivityIdForMonitor(user.id);
  if (!activityId) return { ok: false, message: "Aucune activité associée." };
  markNotificationsRead(activityId);
  revalidatePath("/notifications");
  return { ok: true };
}
