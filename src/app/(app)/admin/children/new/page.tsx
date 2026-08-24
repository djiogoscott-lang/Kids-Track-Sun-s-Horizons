import { ChildForm } from "@/features/presence/ui/child-form";
import { requireUser } from "@/lib/auth/require-user";
import { ACTIVITIES } from "@/server/demo/data";

export default async function NewChildPage() {
  await requireUser("ADMIN");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Ajouter un enfant</h1>
      </div>
      <ChildForm activities={ACTIVITIES} />
    </div>
  );
}
