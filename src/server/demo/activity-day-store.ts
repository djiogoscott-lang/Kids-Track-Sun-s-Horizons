import { ACTIVITIES } from "./data";

export interface ActivityDayState {
  closed: boolean;
  closedAt: Date | null;
  closedBy: string | null;
}

const globalForDayState = globalThis as unknown as { __ktActivityDayState?: Map<string, ActivityDayState> };

function buildInitialState(): Map<string, ActivityDayState> {
  return new Map(ACTIVITIES.map((a) => [a.id, { closed: false, closedAt: null, closedBy: null }]));
}

function store(): Map<string, ActivityDayState> {
  if (!globalForDayState.__ktActivityDayState) {
    globalForDayState.__ktActivityDayState = buildInitialState();
  }
  return globalForDayState.__ktActivityDayState;
}

export function getActivityDayState(activityId: string): ActivityDayState {
  return store().get(activityId) ?? { closed: false, closedAt: null, closedBy: null };
}

export function closeActivityDay(activityId: string, closedBy: string, now = new Date()): void {
  store().set(activityId, { closed: true, closedAt: now, closedBy });
}
