import { isSupabaseConfigured } from "@/lib/env";
import { getChildren as getSupabaseChildren } from "@/server/supabase/children-repo";
import { ACTIVITIES, INITIAL_ACTIVITY_MONITORS } from "./data";
import { getChildren as getDemoChildren } from "./children-store";
import type { PresenceRecord } from "@/features/presence/domain/types";

interface DemoScenario {
  arrivedCount: number;
  leftCount: number;
}

// Mirrors a realistic afternoon: Vélo is fully picked up, Baby Tennis is
// fully still on-site, Danse and Multisport are a mix — so the demo shows
// every visual state (arrived/absent, left/still-present) without waiting
// for the real clock. Only meaningful for the fabricated demo roster —
// real children (Supabase mode) start with a clean, empty day instead.
const SCENARIOS: Record<string, DemoScenario> = {
  "activity-danse": { arrivedCount: 10, leftCount: 6 },
  "activity-multisport": { arrivedCount: 13, leftCount: 5 },
  "activity-velo": { arrivedCount: 9, leftCount: 9 },
  "activity-baby-tennis": { arrivedCount: 8, leftCount: 0 },
};

async function buildInitialRecords(now: Date): Promise<Map<string, PresenceRecord>> {
  const records = new Map<string, PresenceRecord>();

  if (isSupabaseConfigured) {
    const children = await getSupabaseChildren();
    for (const child of children) {
      records.set(child.id, { childId: child.id, activityId: child.activityId, arrived: false, arrivedAt: null, left: false, leftAt: null, daycareManual: false });
    }
    return records;
  }

  const allChildren = await getDemoChildren();
  for (const activity of ACTIVITIES) {
    const children = allChildren.filter((c) => c.activityId === activity.id);
    const scenario = SCENARIOS[activity.id];

    children.forEach((child, index) => {
      const arrived = index < scenario.arrivedCount;
      const left = index < scenario.leftCount;
      const arrivedAt = arrived ? new Date(now.getTime() - (60 + index) * 60_000) : null;
      const leftAt = left ? new Date(now.getTime() - (5 + index) * 60_000) : null;

      records.set(child.id, {
        childId: child.id,
        activityId: activity.id,
        arrived,
        arrivedAt,
        left,
        leftAt,
        daycareManual: false,
      });
    });
  }

  return records;
}

const globalForDemo = globalThis as unknown as { __ktPresenceRecords?: Map<string, PresenceRecord>; __ktPresenceRecordsPromise?: Promise<Map<string, PresenceRecord>> };

export async function getPresenceRecords(): Promise<Map<string, PresenceRecord>> {
  if (globalForDemo.__ktPresenceRecords) return globalForDemo.__ktPresenceRecords;
  if (!globalForDemo.__ktPresenceRecordsPromise) {
    globalForDemo.__ktPresenceRecordsPromise = buildInitialRecords(new Date()).then((records) => {
      globalForDemo.__ktPresenceRecords = records;
      return records;
    });
  }
  return globalForDemo.__ktPresenceRecordsPromise;
}

export async function resetPresenceRecords(): Promise<Map<string, PresenceRecord>> {
  const records = await buildInitialRecords(new Date());
  globalForDemo.__ktPresenceRecords = records;
  return records;
}

// Monitor <-> activity assignment is deliberately mutable and separate from
// the static ACTIVITIES list, so admins can reassign it without touching code.
// Demo-only — Supabase mode reads/writes activities.monitor_id directly
// (see server/supabase/activities-repo.ts) and never touches this map.
const globalForAssignments = globalThis as unknown as { __ktActivityAssignments?: Map<string, string> };

function buildInitialAssignments(): Map<string, string> {
  return new Map(ACTIVITIES.map((a) => [a.id, INITIAL_ACTIVITY_MONITORS[a.id]]));
}

export function getActivityAssignments(): Map<string, string> {
  if (!globalForAssignments.__ktActivityAssignments) {
    globalForAssignments.__ktActivityAssignments = buildInitialAssignments();
  }
  return globalForAssignments.__ktActivityAssignments;
}

/**
 * Each activity has exactly one monitor, so assigning a monitor who is
 * currently elsewhere swaps them with whoever was on this activity —
 * otherwise the same monitor could end up on two activities at once, which
 * would make their own login ambiguous.
 */
export function setActivityMonitor(activityId: string, monitorId: string): void {
  const assignments = getActivityAssignments();
  const previousMonitorOfThisActivity = assignments.get(activityId);
  const otherActivityWithThisMonitor = [...assignments.entries()].find(
    ([otherActivityId, otherMonitorId]) => otherActivityId !== activityId && otherMonitorId === monitorId,
  );

  assignments.set(activityId, monitorId);
  if (otherActivityWithThisMonitor && previousMonitorOfThisActivity) {
    assignments.set(otherActivityWithThisMonitor[0], previousMonitorOfThisActivity);
  }
}
