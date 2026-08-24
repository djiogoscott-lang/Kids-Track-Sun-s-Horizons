"use server";

import { revalidatePath } from "next/cache";
import { assignMonitor, markAbsent, markArrived, markLeft, markStillPresent } from "@/features/presence/application/commands";
import { getActivityIdForMonitor } from "@/features/presence/application/queries";
import { PresenceCommandError } from "@/features/presence/application/errors";
import { requireUser } from "@/lib/auth/require-user";

export type ActionResult = { ok: true } | { ok: false; message: string };

async function assertActivityAccess(activityId: string) {
  const user = await requireUser();
  if (user.role === "ADMIN") return user;
  if (getActivityIdForMonitor(user.id) !== activityId) {
    throw new PresenceCommandError("Vous n'avez pas accès à cette activité.");
  }
  return user;
}

function toResult(fn: () => void): ActionResult {
  try {
    fn();
    return { ok: true };
  } catch (error) {
    if (error instanceof PresenceCommandError) return { ok: false, message: error.message };
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function markArrivedAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = toResult(() => markArrived(activityId, childId));
  revalidatePath(`/activities/${activityId}`);
  revalidatePath("/activities");
  return result;
}

export async function markAbsentAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = toResult(() => markAbsent(activityId, childId));
  revalidatePath(`/activities/${activityId}`);
  revalidatePath("/activities");
  return result;
}

export async function markLeftAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = toResult(() => markLeft(activityId, childId));
  revalidatePath(`/activities/${activityId}`);
  return result;
}

export async function markStillPresentAction(activityId: string, childId: string): Promise<ActionResult> {
  await assertActivityAccess(activityId);
  const result = toResult(() => markStillPresent(activityId, childId));
  revalidatePath(`/activities/${activityId}`);
  return result;
}

export async function assignMonitorAction(activityId: string, monitorId: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = toResult(() => assignMonitor(activityId, monitorId));
  revalidatePath("/admin");
  revalidatePath("/activities");
  revalidatePath(`/activities/${activityId}`);
  return result;
}
