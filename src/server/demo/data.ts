import type { UserRole } from "@/lib/constants/roles";

export interface Monitor {
  id: string;
  name: string;
}

export interface Activity {
  id: string;
  name: string;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
  /** Registered for daycare from the start of the day, independent of pickup time. */
  daycareAuto: boolean;
  /** Inactive children are hidden from rosters without deleting their record. */
  active: boolean;
  notes: string;
}

export const MONITORS: Monitor[] = [
  { id: "monitor-1", name: "Moniteur 1" },
  { id: "monitor-2", name: "Moniteur 2" },
  { id: "monitor-3", name: "Moniteur 3" },
  { id: "monitor-4", name: "Moniteur 4" },
];

export const ACTIVITIES: Activity[] = [
  { id: "activity-danse", name: "Danse" },
  { id: "activity-multisport", name: "Multisport" },
  { id: "activity-velo", name: "Vélo" },
  { id: "activity-baby-tennis", name: "Baby Tennis" },
];

export const INITIAL_ACTIVITY_MONITORS: Record<string, string> = {
  "activity-danse": "monitor-1",
  "activity-multisport": "monitor-2",
  "activity-velo": "monitor-3",
  "activity-baby-tennis": "monitor-4",
};

// Realistic-sounding but entirely fictional demo names — nobody in this list
// corresponds to a real child. A real deployment replaces this seed with
// children entered through the admin "Enfants" screen (children-store.ts).
const FIRST_NAMES = [
  "Lucas", "Emma", "Noah", "Léa", "Gabriel", "Chloé", "Arthur", "Alice",
  "Nathan", "Camille", "Hugo", "Inès", "Louis", "Zoé", "Tom", "Nolan",
  "Jade", "Adam", "Manon", "Liam", "Sarah", "Ethan", "Juliette", "Maël",
];
const LAST_NAMES = [
  "Martin", "Dupont", "Bernard", "Lambert", "Moreau", "Laurent", "Dubois",
  "Simon", "Leroy", "Robert", "Fontaine", "Michel", "Lefèvre", "Mathieu",
  "Janssens", "Peeters", "Rousseau", "Colson",
];

function makeChildren(activityId: string, count: number, offset: number): Child[] {
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i + 1;
    return {
      id: `child-${n}`,
      firstName: FIRST_NAMES[(n - 1) % FIRST_NAMES.length],
      lastName: LAST_NAMES[((n - 1) * 7) % LAST_NAMES.length],
      activityId,
      daycareAuto: n % 7 === 0,
      active: true,
      notes: "",
    };
  });
}

export const INITIAL_CHILDREN: Child[] = [
  ...makeChildren("activity-danse", 12, 0),
  ...makeChildren("activity-multisport", 15, 12),
  ...makeChildren("activity-velo", 10, 27),
  ...makeChildren("activity-baby-tennis", 8, 37),
];

export interface DemoUser {
  id: string;
  name: string;
  role: UserRole;
}

/** One admin plus one login per monitor, so each activity's flow can be demoed directly. */
export const DEMO_USERS: DemoUser[] = [
  { id: "user-admin", name: "Administrateur", role: "ADMIN" },
  ...MONITORS.map((m) => ({ id: m.id, name: m.name, role: "MONITOR" as const })),
];
