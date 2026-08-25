import { closeActivityDay as closeActivityDayInStore, getActivityDayState } from "@/server/demo/activity-day-store";
import { addNotification, markActivityNotificationsRead } from "@/server/demo/notifications-store";
import { getPresenceRecords } from "@/server/demo/store";
import {
  createChildRecord,
  getActivitiesList,
  getChildById,
  getMonitorsList,
  setMonitorForActivity,
  updateChildRecord,
  type ChildRecord,
  type NewChildRecordInput,
} from "@/server/data-source";
import { PresenceCommandError } from "./errors";

async function requireRecord(childId: string, activityId: string) {
  const child = await getChildById(childId);
  if (!child || child.activityId !== activityId) {
    throw new PresenceCommandError("Enfant introuvable pour cette activité.");
  }
  const record = (await getPresenceRecords()).get(childId);
  if (!record) throw new PresenceCommandError("Enfant introuvable pour cette activité.");
  return record;
}

export async function markArrived(activityId: string, childId: string, now = new Date()) {
  const record = await requireRecord(childId, activityId);
  (await getPresenceRecords()).set(childId, { ...record, arrived: true, arrivedAt: now });
}

/** Marking a child absent also clears any departure: an absent child cannot have "left". */
export async function markAbsent(activityId: string, childId: string) {
  const record = await requireRecord(childId, activityId);
  (await getPresenceRecords()).set(childId, { ...record, arrived: false, arrivedAt: null, left: false, leftAt: null });
}

export async function markLeft(activityId: string, childId: string, now = new Date()) {
  const record = await requireRecord(childId, activityId);
  if (!record.arrived) throw new PresenceCommandError("Un enfant absent ne peut pas être marqué parti.");
  (await getPresenceRecords()).set(childId, { ...record, left: true, leftAt: now });
}

export async function markStillPresent(activityId: string, childId: string) {
  const record = await requireRecord(childId, activityId);
  (await getPresenceRecords()).set(childId, { ...record, left: false, leftAt: null });
}

export async function assignMonitor(activityId: string, monitorId: string) {
  const [activities, monitors] = await Promise.all([getActivitiesList(), getMonitorsList()]);
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!monitors.some((m) => m.id === monitorId)) throw new PresenceCommandError("Moniteur introuvable.");
  await setMonitorForActivity(activityId, monitorId);
}

export async function closeActivityDay(activityId: string, closedBy: string) {
  const activities = await getActivitiesList();
  if (!activities.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (getActivityDayState(activityId).closed) throw new PresenceCommandError("Cette activité est déjà clôturée.");
  closeActivityDayInStore(activityId, closedBy);
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
  (await getPresenceRecords()).set(child.id, {
    childId: child.id,
    activityId: child.activityId,
    arrived: false,
    arrivedAt: null,
    left: false,
    leftAt: null,
  });
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
    (await getPresenceRecords()).set(childId, {
      childId,
      activityId: input.activityId,
      arrived: false,
      arrivedAt: null,
      left: false,
      leftAt: null,
    });
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
