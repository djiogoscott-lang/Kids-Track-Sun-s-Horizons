import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";

export default async function AdminIndexPage() {
  await requireUser("ADMIN");
  redirect("/admin/dashboard");
}
