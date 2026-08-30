import { ChildForm } from "@/features/presence/ui/child-form";
import { requireUser } from "@/lib/auth/require-user";
import { getActivitiesList } from "@/server/data-source";

export default async function NewChildPage() {
  await requireUser("ADMIN");
  const allActivities = await getActivitiesList();
  // A new enrollment can only ever target an active activity.
  const activities = allActivities.filter((a) => a.active);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Ajouter un enfant</h1>
      </div>
      <ChildForm activities={activities} />
    </div>
  );
}
