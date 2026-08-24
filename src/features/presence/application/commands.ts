import { ACTIVITIES, MONITORS } from "@/server/demo/data";
import { closeActivityDay as closeActivityDayInStore, getActivityDayState } from "@/server/demo/activity-day-store";
import { createChild as createChildInStore, getChild, updateChild as updateChildInStore, type NewChildInput } from "@/server/demo/children-store";
import { addNotification, markActivityNotificationsRead } from "@/server/demo/notifications-store";
import { getPresenceRecords, setActivityMonitor } from "@/server/demo/store";
import { PresenceCommandError } from "./errors";

function requireRecord(childId: string, activityId: string) {
  const child = getChild(childId);
  if (!child || child.activityId !== activityId) {
    throw new PresenceCommandError("Enfant introuvable pour cette activité.");
  }
  const record = getPresenceRecords().get(childId);
  if (!record) throw new PresenceCommandError("Enfant introuvable pour cette activité.");
  return record;
}

export function markArrived(activityId: string, childId: string, now = new Date()) {
  const record = requireRecord(childId, activityId);
  getPresenceRecords().set(childId, { ...record, arrived: true, arrivedAt: now });
}

/** Marking a child absent also clears any departure: an absent child cannot have "left". */
export function markAbsent(activityId: string, childId: string) {
  const record = requireRecord(childId, activityId);
  getPresenceRecords().set(childId, { ...record, arrived: false, arrivedAt: null, left: false, leftAt: null });
}

export function markLeft(activityId: string, childId: string, now = new Date()) {
  const record = requireRecord(childId, activityId);
  if (!record.arrived) throw new PresenceCommandError("Un enfant absent ne peut pas être marqué parti.");
  getPresenceRecords().set(childId, { ...record, left: true, leftAt: now });
}

export function markStillPresent(activityId: string, childId: string) {
  const record = requireRecord(childId, activityId);
  getPresenceRecords().set(childId, { ...record, left: false, leftAt: null });
}

export function assignMonitor(activityId: string, monitorId: string) {
  if (!ACTIVITIES.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!MONITORS.some((m) => m.id === monitorId)) throw new PresenceCommandError("Moniteur introuvable.");
  setActivityMonitor(activityId, monitorId);
}

export function closeActivityDay(activityId: string, closedBy: string) {
  if (!ACTIVITIES.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (getActivityDayState(activityId).closed) throw new PresenceCommandError("Cette activité est déjà clôturée.");
  closeActivityDayInStore(activityId, closedBy);
}

function validateChildInput(input: Pick<NewChildInput, "firstName" | "lastName" | "activityId">) {
  if (!input.firstName.trim() || !input.lastName.trim()) {
    throw new PresenceCommandError("Le prénom et le nom sont obligatoires.");
  }
  if (!ACTIVITIES.some((a) => a.id === input.activityId)) {
    throw new PresenceCommandError("Activité introuvable.");
  }
}

export function createChild(input: NewChildInput) {
  validateChildInput(input);
  const child = createChildInStore(input);
  getPresenceRecords().set(child.id, {
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

export function updateChild(childId: string, input: UpdateChildInput) {
  validateChildInput(input);
  const existing = getChild(childId);
  if (!existing) throw new PresenceCommandError("Enfant introuvable.");

  const updated = updateChildInStore(childId, input);
  if (!updated) throw new PresenceCommandError("Enfant introuvable.");

  // Moving a child to another activity resets today's presence: their old
  // record belongs to an activity they are no longer part of.
  if (existing.activityId !== input.activityId) {
    getPresenceRecords().set(childId, {
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

export function setChildActive(childId: string, active: boolean) {
  const updated = updateChildInStore(childId, { active });
  if (!updated) throw new PresenceCommandError("Enfant introuvable.");
  return updated;
}

export function sendNotification(activityId: string, message: string, createdBy: string) {
  if (!ACTIVITIES.some((a) => a.id === activityId)) throw new PresenceCommandError("Activité introuvable.");
  if (!message.trim()) throw new PresenceCommandError("Le message ne peut pas être vide.");
  return addNotification(activityId, message.trim(), createdBy);
}

export function markNotificationsRead(activityId: string) {
  markActivityNotificationsRead(activityId);
}
