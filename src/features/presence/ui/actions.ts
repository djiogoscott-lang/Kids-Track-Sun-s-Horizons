"use server";

import { revalidatePath } from "next/cache";
import {
  addChildToDaycare,
  addChildToRoster,
  assignMonitor,
  bulkDeleteChildren,
  closeActivityDay,
  createAccount,
  createActivity,
  createChild,
  deleteActivity,
  deleteChildPermanently,
  duplicatePreviousWeekRoster,
  getActivityDependencyCounts,
  getOperationalResetPreview,
  markAbsent,
  markArrived,
  markLeft,
  markNotificationsRead,
  markStillPresent,
  removeChildFromRoster,
  resetOperationalData,
  resetRosterForActivityWeek,
  sendNotification,
  setChildActive,
  setMonitorActive,
  unassignActivityMonitor,
  updateActivity,
  updateChild,
  updateMonitorName,
  updateMonitorPassword,
  type CreateActivityInput,
  type UpdateActivityInput,
  type UpdateChildInput,
} from "@/features/presence/application/commands";
import { getActivityDetail, getActivityIdForMonitor, getEffectiveActivityIdForChild } from "@/features/presence/application/queries";
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
 * real activity for THIS WEEK (roster-resolved, not their permanent
 * children.activityId reference) is looked up here and is what
 * assertActivityAccess checks a monitor against, so a monitor can never
 * smuggle in another activity's child by any client-side means, and a child
 * moved to a different activity's roster this week is authorized against
 * their current roster activity, not a stale one.
 */
export async function addChildToDaycareAction(childId: string): Promise<ActionResult> {
  const effectiveActivityId = await getEffectiveActivityIdForChild(childId);
  if (!effectiveActivityId) return { ok: false, message: "Cet enfant ne fait pas partie du roster de la semaine." };
  const result = await toResult(async () => {
    const user = await assertActivityAccess(effectiveActivityId);
    await addChildToDaycare(childId, user.id);
  });
  revalidateActivityViews(effectiveActivityId);
  return result;
}

export type NewSessionCheckResult =
  | { ok: true; alreadyExists: true }
  | { ok: true; alreadyExists: false; total: number; notMarkedCount: number }
  | { ok: false; message: string };

/**
 * Purely a read + a confirmation message — there is nothing to create. A day
 * with zero attendance rows already IS "0 présent / 0 absent / tous non
 * traité" (see morningStatus in domain/types.ts), so a brand new calendar
 * date starts clean automatically with no write at all. This only exists to
 * (a) give the admin an explicit, visible confirmation of that fact and
 * (b) refuse to imply a fresh session when today already has real data —
 * re-fetched fresh here rather than trusting whatever the page last
 * rendered, since a monitor could have started the roll call in the
 * meantime.
 */
export async function checkNewSessionAction(activityId: string): Promise<NewSessionCheckResult> {
  await requireUser("ADMIN");
  const detail = await getActivityDetail(activityId);
  if (!detail) return { ok: false, message: "Activité introuvable." };
  if (detail.sessionState !== "NOT_STARTED") return { ok: true, alreadyExists: true };
  return { ok: true, alreadyExists: false, total: detail.morningCounters.total, notMarkedCount: detail.morningCounters.notMarkedCount };
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
  revalidatePath("/admin/activities");
  revalidatePath("/activities");
  revalidatePath(`/activities/${activityId}`);
  return result;
}

function revalidateActivityAdminViews(activityId?: string) {
  revalidatePath("/admin/activities");
  revalidatePath("/admin/monitors");
  revalidatePath("/activities");
  revalidatePath("/admin/roster");
  if (activityId) revalidatePath(`/activities/${activityId}`);
}

export async function unassignMonitorAction(activityId: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => unassignActivityMonitor(activityId));
  revalidateActivityAdminViews(activityId);
  return result;
}

export async function createActivityAction(input: CreateActivityInput): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => createActivity(input));
  revalidateActivityAdminViews();
  return result;
}

export async function updateActivityAction(activityId: string, input: UpdateActivityInput): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => updateActivity(activityId, input));
  revalidateActivityAdminViews(activityId);
  return result;
}

export type ActivityDependencyResult =
  | { ok: true; children: number; weeklyRoster: number; attendance: number; activityDayState: number; notifications: number }
  | { ok: false; message: string };

export async function getActivityDependencyCountsAction(activityId: string): Promise<ActivityDependencyResult> {
  await requireUser("ADMIN");
  try {
    const counts = await getActivityDependencyCounts(activityId);
    return { ok: true, ...counts };
  } catch {
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function deleteActivityAction(activityId: string): Promise<ActionResult> {
  await requireUser("ADMIN");
  const result = await toResult(() => deleteActivity(activityId));
  revalidateActivityAdminViews(activityId);
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

// ---------------------------------------------------------------------------
// Weekly roster — admin-only ("Aucun moniteur ne peut modifier le roster
// global."), and always revalidates the live activity views since a roster
// change immediately changes who appears in today's séance.
// ---------------------------------------------------------------------------

function revalidateRosterViews() {
  revalidatePath("/admin/roster");
  revalidatePath("/activities");
  revalidatePath("/admin/presences");
  revalidatePath("/garderie");
}

export async function addChildToRosterAction(childId: string, activityId: string, weekStart: string): Promise<ActionResult> {
  const admin = await requireUser("ADMIN");
  const result = await toResult(() => addChildToRoster(childId, activityId, weekStart, admin.id));
  revalidateRosterViews();
  return result;
}

export async function removeChildFromRosterAction(childId: string, weekStart: string): Promise<ActionResult> {
  const admin = await requireUser("ADMIN");
  const result = await toResult(() => removeChildFromRoster(childId, weekStart, admin.id));
  revalidateRosterViews();
  return result;
}

export type ResetRosterActionResult = { ok: true; removedCount: number } | { ok: false; message: string };

export async function resetRosterForActivityWeekAction(activityId: string, weekStart: string): Promise<ResetRosterActionResult> {
  const admin = await requireUser("ADMIN");
  try {
    const { removedCount } = await resetRosterForActivityWeek(activityId, weekStart, admin.id);
    revalidateRosterViews();
    return { ok: true, removedCount };
  } catch (error) {
    if (error instanceof PresenceCommandError) return { ok: false, message: error.message };
    console.error("Unexpected error resetting roster:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export type DuplicateWeekActionResult = { ok: true; addedCount: number } | { ok: false; message: string };

export async function duplicatePreviousWeekAction(fromWeekStart: string, toWeekStart: string): Promise<DuplicateWeekActionResult> {
  const admin = await requireUser("ADMIN");
  try {
    const addedCount = await duplicatePreviousWeekRoster(fromWeekStart, toWeekStart, admin.id);
    revalidateRosterViews();
    return { ok: true, addedCount };
  } catch (error) {
    if (error instanceof PresenceCommandError) return { ok: false, message: error.message };
    console.error("Unexpected error duplicating roster week:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

// ---------------------------------------------------------------------------
// Operational reset — the most destructive action in the app. ADMIN-only,
// and the preview must always be re-fetched fresh right before the confirm
// button is even shown (never trust counts computed earlier in the session)
// since a monitor could have added attendance in the meantime.
// ---------------------------------------------------------------------------

export type ResetPreviewResult =
  | { ok: true; attendance: number; activityDayState: number; weeklyRoster: number; notifications: number }
  | { ok: false; message: string };

export async function getOperationalResetPreviewAction(): Promise<ResetPreviewResult> {
  await requireUser("ADMIN");
  try {
    const counts = await getOperationalResetPreview();
    return { ok: true, ...counts };
  } catch {
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export type ResetOperationalDataResult =
  | { ok: true; attendance: number; activityDayState: number; weeklyRoster: number; notifications: number }
  | { ok: false; message: string };

function revalidateAfterReset() {
  revalidatePath("/admin/activities");
  revalidatePath("/admin/roster");
  revalidatePath("/admin/presences");
  revalidatePath("/admin/departures");
  revalidatePath("/admin/notifications");
  revalidatePath("/admin/history");
  revalidatePath("/admin/history/week");
  revalidatePath("/activities");
  revalidatePath("/garderie");
  revalidatePath("/notifications");
}

export async function resetOperationalDataAction(): Promise<ResetOperationalDataResult> {
  const admin = await requireUser("ADMIN");
  try {
    const counts = await resetOperationalData(admin.id);
    revalidateAfterReset();
    return { ok: true, ...counts };
  } catch (error) {
    if (error instanceof PresenceCommandError) return { ok: false, message: error.message };
    console.error("Unexpected error resetting operational data:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}
