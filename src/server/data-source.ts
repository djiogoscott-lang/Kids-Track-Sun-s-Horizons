/**
 * Single switch point between the in-memory demo store and Supabase.
 *
 * Two independent flags, two independent dimensions:
 *  - isSupabaseConfigured: where the activity/children ROSTER lives.
 *  - isSupabaseAuthEnabled: whether the CURRENT SESSION is a real Supabase
 *    Auth user or a demo cookie.
 *
 * The monitor/assignment dimension (who is logged in, which activity are
 * they assigned to) cannot migrate ahead of real auth: a demo session's id
 * ("monitor-1") will never match a real Supabase UUID. So monitor identity
 * and activity<->monitor assignment stay on the demo map until
 * isSupabaseAuthEnabled is true, regardless of where the roster itself
 * lives — while data is in Supabase but auth is still demo, each Supabase
 * activity's monitorId is bridged back to its demo counterpart by name
 * (the one thing stable across both representations), so the rest of the
 * app can keep treating activity.monitorId as "whoever can actually act as
 * this activity's monitor right now" without knowing about any of this.
 */
import { isSupabaseAuthEnabled, isSupabaseConfigured } from "@/lib/env";
import { ACTIVITIES, MONITORS } from "@/server/demo/data";
import * as demoChildren from "@/server/demo/children-store";
import { getActivityAssignments, setActivityMonitor as setDemoActivityMonitor } from "@/server/demo/store";
import * as supaActivities from "@/server/supabase/activities-repo";
import * as supaChildren from "@/server/supabase/children-repo";

export interface ActivityRecord {
  id: string;
  name: string;
  monitorId: string | null;
}

export interface MonitorRecord {
  id: string;
  name: string;
}

export interface ChildRecord {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  active: boolean;
  notes: string;
}

export async function getActivitiesList(): Promise<ActivityRecord[]> {
  if (!isSupabaseConfigured) {
    const assignments = getActivityAssignments();
    return ACTIVITIES.map((a) => ({ id: a.id, name: a.name, monitorId: assignments.get(a.id) ?? null }));
  }

  const activities = await supaActivities.getActivities();
  if (isSupabaseAuthEnabled) return activities;

  const demoAssignments = getActivityAssignments();
  return activities.map((a) => {
    const demoActivityId = ACTIVITIES.find((d) => d.name === a.name)?.id;
    return { ...a, monitorId: (demoActivityId && demoAssignments.get(demoActivityId)) ?? null };
  });
}

export async function getMonitorsList(): Promise<MonitorRecord[]> {
  if (isSupabaseAuthEnabled) return supaActivities.getMonitors();
  return MONITORS.map((m) => ({ id: m.id, name: m.name }));
}

export async function setMonitorForActivity(activityId: string, monitorId: string): Promise<void> {
  if (isSupabaseAuthEnabled) return supaActivities.setActivityMonitor(activityId, monitorId);
  // Demo session assigning a demo monitor id: resolve to the matching demo
  // activity by name (activityId here may be a real Supabase UUID) and
  // update the demo map — never write a demo id into Supabase's UUID column.
  if (isSupabaseConfigured) {
    const activities = await supaActivities.getActivities();
    const name = activities.find((a) => a.id === activityId)?.name;
    const demoActivityId = name ? ACTIVITIES.find((a) => a.name === name)?.id : undefined;
    if (demoActivityId) setDemoActivityMonitor(demoActivityId, monitorId);
    return;
  }
  setDemoActivityMonitor(activityId, monitorId);
}

export async function getChildrenList(): Promise<ChildRecord[]> {
  if (isSupabaseConfigured) return supaChildren.getChildren();
  return demoChildren.getChildren();
}

export async function getChildById(childId: string): Promise<ChildRecord | undefined> {
  if (isSupabaseConfigured) return supaChildren.getChild(childId);
  return demoChildren.getChild(childId);
}

export interface NewChildRecordInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
}

export async function createChildRecord(input: NewChildRecordInput): Promise<ChildRecord> {
  if (isSupabaseConfigured) return supaChildren.createChild(input);
  return demoChildren.createChild(input);
}

export type ChildRecordUpdate = Partial<Pick<ChildRecord, "firstName" | "lastName" | "activityId" | "daycareAuto" | "notes" | "active">>;

export async function updateChildRecord(childId: string, update: ChildRecordUpdate): Promise<ChildRecord | null> {
  if (isSupabaseConfigured) return supaChildren.updateChild(childId, update);
  return demoChildren.updateChild(childId, update);
}
