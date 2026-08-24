import { INITIAL_CHILDREN, type Child } from "./data";

// The children roster is the piece most obviously destined for a real
// database: everything reads through these functions instead of the
// INITIAL_CHILDREN constant, so swapping this file for Supabase queries
// later does not touch application/, domain/, or ui/ at all.
const globalForChildren = globalThis as unknown as { __ktChildren?: Map<string, Child> };

function buildInitialChildren(): Map<string, Child> {
  return new Map(INITIAL_CHILDREN.map((child) => [child.id, child]));
}

function store(): Map<string, Child> {
  if (!globalForChildren.__ktChildren) {
    globalForChildren.__ktChildren = buildInitialChildren();
  }
  return globalForChildren.__ktChildren;
}

export function getChildren(): Child[] {
  return [...store().values()];
}

export function getChild(childId: string): Child | undefined {
  return store().get(childId);
}

let nextChildNumber = INITIAL_CHILDREN.length + 1;

export interface NewChildInput {
  firstName: string;
  lastName: string;
  activityId: string;
  daycareAuto: boolean;
  notes: string;
}

export function createChild(input: NewChildInput): Child {
  const child: Child = {
    id: `child-${nextChildNumber++}`,
    firstName: input.firstName,
    lastName: input.lastName,
    activityId: input.activityId,
    daycareAuto: input.daycareAuto,
    active: true,
    notes: input.notes,
  };
  store().set(child.id, child);
  return child;
}

export type ChildUpdate = Partial<Pick<Child, "firstName" | "lastName" | "activityId" | "daycareAuto" | "notes" | "active">>;

export function updateChild(childId: string, update: ChildUpdate): Child | null {
  const existing = store().get(childId);
  if (!existing) return null;
  const updated = { ...existing, ...update };
  store().set(childId, updated);
  return updated;
}
