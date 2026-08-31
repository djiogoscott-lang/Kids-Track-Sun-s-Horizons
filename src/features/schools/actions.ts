"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { requireUser } from "@/lib/auth/require-user";
import { ACTIVE_SCHOOL_COOKIE, getUserSchools } from "@/lib/schools/context";
import { createSchool, isSuperAdmin, updateSchool, type SchoolInput } from "@/server/supabase/schools-repo";
import { isSupabaseAuthEnabled } from "@/lib/env";

export type SchoolActionResult = { ok: true } | { ok: false; message: string };

const NAME_MAX = 160;

/**
 * Demo mode has no real profiles rows to carry the flag, so it grants
 * super-admin to the demo admin — it is a local testing bridge, never
 * enabled in production (Vercel runs with real auth).
 */
async function requireSuperAdmin(): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  const user = await requireUser("ADMIN");
  if (!isSupabaseAuthEnabled) return { ok: true, userId: user.id };
  if (!(await isSuperAdmin(user.id))) {
    return { ok: false, message: "Seul un super-administrateur peut gérer les écoles." };
  }
  return { ok: true, userId: user.id };
}

function validate(input: SchoolInput): string | null {
  if (!input.name.trim()) return "Le nom de l'école est obligatoire.";
  if (input.name.trim().length > NAME_MAX) return `Le nom ne peut pas dépasser ${NAME_MAX} caractères.`;
  if (input.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.contactEmail.trim())) {
    return "Adresse e-mail de contact invalide.";
  }
  return null;
}

function revalidateSchoolViews() {
  revalidatePath("/admin/schools");
  revalidatePath("/admin/activities");
  revalidatePath("/activities");
}

export async function createSchoolAction(input: SchoolInput): Promise<SchoolActionResult> {
  const auth = await requireSuperAdmin();
  if (!auth.ok) return auth;
  const invalid = validate(input);
  if (invalid) return { ok: false, message: invalid };

  try {
    await createSchool({ ...input, name: input.name.trim() });
    revalidateSchoolViews();
    return { ok: true };
  } catch (error) {
    console.error("Unexpected error creating a school:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

export async function updateSchoolAction(schoolId: string, input: Partial<SchoolInput>): Promise<SchoolActionResult> {
  // An admin may edit a school they belong to; only a super admin may edit
  // one they don't. Membership is read server-side, never from the client.
  const user = await requireUser("ADMIN");
  const schools = await getUserSchools();
  const belongs = schools.some((s) => s.schoolId === schoolId);
  if (!belongs) {
    const auth = await requireSuperAdmin();
    if (!auth.ok) return { ok: false, message: "Vous n'avez pas accès à cette école." };
  }
  void user;

  if (input.name !== undefined || input.contactEmail !== undefined) {
    const invalid = validate({
      name: input.name ?? "placeholder",
      address: "",
      city: "",
      postalCode: "",
      contactName: "",
      contactEmail: input.contactEmail ?? "",
      phone: "",
      active: true,
    });
    if (invalid) return { ok: false, message: invalid };
  }

  try {
    await updateSchool(schoolId, input.name !== undefined ? { ...input, name: input.name.trim() } : input);
    revalidateSchoolViews();
    return { ok: true };
  } catch (error) {
    console.error("Unexpected error updating a school:", error);
    return { ok: false, message: "Une erreur est survenue. Veuillez réessayer." };
  }
}

/**
 * Switches the working school. The cookie is only a preference — every read
 * re-validates it against the user's real memberships (see
 * getActiveSchoolId), so setting it to a school the user does not belong to
 * grants nothing. The membership check here exists to give an honest error
 * rather than silently ignoring the request.
 */
export async function switchSchoolAction(schoolId: string): Promise<SchoolActionResult> {
  await requireUser();
  const schools = await getUserSchools();
  if (!schools.some((s) => s.schoolId === schoolId)) {
    return { ok: false, message: "Vous n'avez pas accès à cette école." };
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_SCHOOL_COOKIE, schoolId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  // Everything is school-scoped, so switching school invalidates every view.
  revalidatePath("/", "layout");
  return { ok: true };
}
