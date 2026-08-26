import { addNotification, markActivityNotificationsRead } from "@/server/demo/notifications-store";
import {
  closeDay,
  createChildRecord,
  getActivitiesList,
  getAttendanceMap,
  getChildById,
  getDayState,
  getMonitorsList,
  setAttendance,
  setMonitorForActivity,
  updateChildRecord,
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

export async function sendNotification(activityId: string, message: string, createdBy: string) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!message.trim()) throw new PresenceCommandError("Le message ne peut pas être vide.");
  return addNotification(activityId, message.trim(), createdBy);
}

export function markNotificationsRead(activityId: string) {
  markActivityNotificationsRead(activityId);
}
