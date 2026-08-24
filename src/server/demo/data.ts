import type { UserRole } from "@/lib/constants/roles";

export interface Monitor {
  id: string;
  name: string;
}

export interface Activity {
  id: string;
  name: string;
  monitorId: string;
}

export interface Child {
  id: string;
  firstName: string;
  lastName: string;
  activityId: string;
}

export const MONITORS: Monitor[] = [
  { id: "monitor-1", name: "Moniteur 1" },
  { id: "monitor-2", name: "Moniteur 2" },
  { id: "monitor-3", name: "Moniteur 3" },
  { id: "monitor-4", name: "Moniteur 4" },
];

export const ACTIVITIES: Activity[] = [
  { id: "activity-danse", name: "Danse", monitorId: "monitor-1" },
  { id: "activity-multisport", name: "Multisport", monitorId: "monitor-2" },
  { id: "activity-velo", name: "Vélo", monitorId: "monitor-3" },
  { id: "activity-baby-tennis", name: "Baby Tennis", monitorId: "monitor-4" },
];

const FIRST_NAMES = [
  "Lucas", "Emma", "Noah", "Adam", "Léa", "Gabriel", "Chloé", "Nathan", "Manon", "Louis",
  "Camille", "Hugo", "Inès", "Arthur", "Zoé", "Jules", "Lina", "Liam", "Sarah", "Mohamed",
  "Yasmine", "Ethan", "Alice", "Rayan", "Juliette", "Maël", "Nour", "Théo", "Amina", "Oscar",
  "Elena", "Samuel", "Mila", "Victor", "Safia", "Léon", "Rose", "Antoine", "Salma", "Milo",
  "Anaïs", "Baptiste", "Enzo", "Clara", "Louise",
];
const LAST_NAMES = [
  "Martin", "Dupont", "Bernard", "Lambert", "Peeters", "Janssens", "Dubois", "Lemaire",
  "Moreau", "Simon", "Leroy", "Fontaine", "Rousseau", "Colson", "Gilson", "Wauters",
];

function makeChildren(activityId: string, count: number, offset: number): Child[] {
  return Array.from({ length: count }, (_, i) => {
    const n = offset + i;
    return {
      id: `child-${n}`,
      firstName: FIRST_NAMES[n % FIRST_NAMES.length],
      lastName: LAST_NAMES[(n * 5) % LAST_NAMES.length],
      activityId,
    };
  });
}

export const CHILDREN: Child[] = [
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
