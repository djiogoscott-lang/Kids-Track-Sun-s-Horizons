import {
  addNotificationRecord,
  closeDay,
  createAccountRecord,
  createChildRecord,
  deleteChildRecordPermanently,
  getActivitiesList,
  getAttendanceMap,
  getChildById,
  getDayState,
  getMonitorsList,
  isMonitorEmailTaken,
  markActivityNotificationsReadData,
  setAttendance,
  setMonitorActiveRecord,
  setMonitorForActivity,
  updateAccountPasswordRecord,
  updateChildRecord,
  updateMonitorNameRecord,
  type ChildRecord,
  type NewChildRecordInput,
} from "@/server/data-source";
import type { PresenceRecord } from "@/features/presence/domain/types";
import { PresenceCommandError } from "./errors";

function emptyRecord(childId: string, activityId: string): PresenceRecord {
  return { childId, activityId, arrived: false, arrivedAt: null, left: false, leftAt: null };
}

/** A child with no attendance row yet is not an error — it's the normal
 * "not marked today" starting state (real rows only exist once someone
 * actually records something). */
async function requireRecord(childId: string, activityId: string, now: Date): Promise<PresenceRecord> {
  const child = await getChildById(childId);
  if (!child || child.activityId !== activityId) {
    throw new PresenceCommandError("Enfant introuvable pour cette activité.");
  }
  const records = await getAttendanceMap(now, activityId);
  return records.get(childId) ?? emptyRecord(childId, activityId);
}

export async function markArrived(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  await requireRecord(childId, activityId, now);
  await setAttendance(childId, activityId, now, { arrived: true, arrivedAt: now }, recordedBy);
}

/** Marking a child absent also clears any departure: an absent child cannot have "left". */
export async function markAbsent(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  await requireRecord(childId, activityId, now);
  await setAttendance(childId, activityId, now, { arrived: false, arrivedAt: null, departed: false, departedAt: null }, recordedBy);
}

export async function markLeft(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  const record = await requireRecord(childId, activityId, now);
  if (!record.arrived) throw new PresenceCommandError("Un enfant absent ne peut pas être marqué parti.");
  await setAttendance(childId, activityId, now, { departed: true, departedAt: now }, recordedBy);
}

export async function markStillPresent(activityId: string, childId: string, recordedBy: string, now = new Date()) {
  await requireRecord(childId, activityId, now);
  await setAttendance(childId, activityId, now, { departed: false, departedAt: null }, recordedBy);
}

export async function assignMonitor(activityId: string, monitorId: string) {
  const [activities, monitors] = await Promise.all([getActivitiesList(), getMonitorsList()]);
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!monitors.some((m) => m.id === monitorId)) throw new PresenceCommandError("Moniteur introuvable.");
  await setMonitorForActivity(activityId, monitorId);
}

/**
 * Guarded twice against double-closure: once here (a friendly error message
 * before ever touching the write path) and once more at the repository
 * layer (server/supabase/activity-day-state-repo.ts), which is the one that
 * actually matters — a reload racing a second tap can't slip past both.
 */
export async function closeActivityDay(activityId: string, closedByUserId: string, closedByName: string, now = new Date()) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  const dayState = await getDayState(activityId, now);
  if (dayState.closed) throw new PresenceCommandError("Cette séance est déjà clôturée.");
  await closeDay(activityId, now, closedByUserId, closedByName);
}

async function validateChildInput(input: Pick<NewChildRecordInput, "firstName" | "lastName" | "activityId">) {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new PresenceCommandError("Le prénom et le nom sont obligatoires.");
  }
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === input.activityId)) {
    throw new PresenceCommandError("Activité introuvable.");
  }
}

export async function createChild(input: NewChildRecordInput): Promise<ChildRecord> {
  await validateChildInput(input);
  const child = await createChildRecord(input);
  await setAttendance(child.id, child.activityId, new Date(), { arrived: false, arrivedAt: null, departed: false, departedAt: null }, null);
  return child;
}

export interface UpdateChildInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
}

export async function updateChild(childId: string, input: UpdateChildInput): Promise<ChildRecord> {
  await validateChildInput(input);
  const existing = await getChildById(childId);
  if (!existing) throw new PresenceCommandError("Enfant introuvable.");

  const updated = await updateChildRecord(childId, input);
  if (!updated) throw new PresenceCommandError("Enfant introuvable.");

  // Moving a child to another activity resets today's presence: their old
  // record belongs to an activity they are no longer part of.
  if (existing.activityId !== input.activityId) {
    await setAttendance(childId, input.activityId, new Date(), { arrived: false, arrivedAt: null, departed: false, departedAt: null }, null);
  }
  return updated;
}

export async function setChildActive(childId: string, active: boolean): Promise<ChildRecord> {
  const updated = await updateChildRecord(childId, { active });
  if (!updated) throw new PresenceCommandError("Enfant introuvable.");
  return updated;
}

/**
 * confirmationText is re-checked here, not just enforced by a disabled
 * button in the UI — the "type SUPPRIMER" requirement is a safeguard against
 * misclicks, and a client-only check would be trivial to bypass.
 */
export async function deleteChildPermanently(childId: string, confirmationText: string): Promise<void> {
  if (confirmationText.trim().toUpperCase() !== "SUPPRIMER") {
    throw new PresenceCommandError('Tapez "SUPPRIMER" pour confirmer.');
  }
  const child = await getChildById(childId);
  if (!child) throw new PresenceCommandError("Enfant introuvable.");
  await deleteChildRecordPermanently(childId);
}

export interface BulkDeleteResult {
  deletedCount: number;
  blockedNames: string[];
}

/**
 * Each child is attempted independently rather than as one all-or-nothing
 * operation: a batch of 24 children where 3 have history should delete the
 * 21 that can be deleted and clearly report the 3 that can't, not fail the
 * whole batch over rows that were never going to succeed anyway.
 */
export async function bulkDeleteChildren(childIds: string[], confirmationText: string): Promise<BulkDeleteResult> {
  if (confirmationText.trim().toUpperCase() !== "SUPPRIMER") {
    throw new PresenceCommandError('Tapez "SUPPRIMER" pour confirmer.');
  }
  let deletedCount = 0;
  const blockedNames: string[] = [];
  for (const childId of childIds) {
    const child = await getChildById(childId);
    if (!child) continue;
    try {
      await deleteChildRecordPermanently(childId);
      deletedCount++;
    } catch (error) {
      if (error instanceof PresenceCommandError) {
        blockedNames.push(`${child.firstName} ${child.lastName}`);
      } else {
        throw error;
      }
    }
  }
  return { deletedCount, blockedNames };
}

export async function sendNotification(activityId: string, message: string, createdByUserId: string, createdByName: string) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!message.trim()) throw new PresenceCommandError("Le message ne peut pas être vide.");
  return addNotificationRecord(activityId, message.trim(), createdByUserId, createdByName);
}

export async function markNotificationsRead(activityId: string) {
  await markActivityNotificationsReadData(activityId);
}

export async function setMonitorActive(monitorId: string, active: boolean, actingAdminId: string) {
  await setMonitorActiveRecord(monitorId, active, actingAdminId);
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

function assertValidPassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    throw new PresenceCommandError("Le mot de passe ne respecte pas les conditions requises.");
  }
}

/**
 * The admin chooses the password directly — no invitation email, no
 * "set your own password" step. Validated here (format, length, uniqueness)
 * before ever reaching Supabase Auth; createAccountRecord() rolls back the
 * Auth user itself if a later step (membership, activity) fails, so this
 * never leaves a half-created account behind.
 */
export async function createAccount(
  email: string,
  password: string,
  firstName: string,
  lastName: string,
  role: "ADMIN" | "MONITOR",
  activityId: string | null,
) {
  const trimmedEmail = email.trim();
  if (!EMAIL_PATTERN.test(trimmedEmail)) throw new PresenceCommandError("Adresse email invalide.");
  if (!firstName.trim() || !lastName.trim()) throw new PresenceCommandError("Le prénom et le nom sont obligatoires.");
  assertValidPassword(password);
  if (await isMonitorEmailTaken(trimmedEmail)) throw new PresenceCommandError("Cette adresse e-mail est déjà utilisée.");
  if (activityId) {
    const activities = await getActivitiesList();
    if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  }
  const fullName = `${firstName.trim()} ${lastName.trim()}`;
  return createAccountRecord(trimmedEmail, password, fullName, role, activityId);
}

export async function updateMonitorName(monitorId: string, fullName: string) {
  if (!fullName.trim()) throw new PresenceCommandError("Le nom est obligatoire.");
  await updateMonitorNameRecord(monitorId, fullName.trim());
}

export async function updateMonitorPassword(monitorId: string, newPassword: string, confirmPassword: string) {
  if (newPassword !== confirmPassword) throw new PresenceCommandError("Les deux mots de passe ne correspondent pas.");
  assertValidPassword(newPassword);
  await updateAccountPasswordRecord(monitorId, newPassword);
}
