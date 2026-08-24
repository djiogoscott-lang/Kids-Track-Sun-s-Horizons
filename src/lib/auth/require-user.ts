import { redirect } from "next/navigation";
import type { UserRole } from "@/lib/constants/roles";
import { getCurrentUser, resolveHomePath, type CurrentUser } from "./session";

export async function requireUser(role?: UserRole): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (role && user.role !== role) redirect(await resolveHomePath(user));
  return user;
}
