import { ACTIVITIES, CHILDREN, MONITORS } from "@/server/demo/data";
import { getPresenceRecords, setActivityMonitor } from "@/server/demo/store";
import { PresenceCommandError } from "./errors";

function requireRecord(childId: string, activityId: string) {
  const child = CHILDREN.find((c) => c.id === childId);
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
