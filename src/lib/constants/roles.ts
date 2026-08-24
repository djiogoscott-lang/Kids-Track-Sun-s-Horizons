export const USER_ROLES = ["ADMIN", "MONITOR"] as const;

export type UserRole = (typeof USER_ROLES)[number];

export function isAdmin(role: UserRole) {
  return role === "ADMIN";
}
