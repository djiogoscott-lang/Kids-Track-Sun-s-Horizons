import { notFound } from "next/navigation";
import { getChildForAdmin } from "@/features/presence/application/queries";
import { ChildForm } from "@/features/presence/ui/child-form";
import { requireUser } from "@/lib/auth/require-user";
import { getActivitiesList } from "@/server/data-source";

export default async function EditChildPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser("ADMIN");
  const { id } = await params;
  const [child, activities] = await Promise.all([getChildForAdmin(id), getActivitiesList()]);
  if (!child) notFound();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
          {child.firstName} {child.lastName}
        </h1>
      </div>
      <ChildForm
        activities={activities}
        childId={child.id}
        initial={{
          firstName: child.firstName,
          lastName: child.lastName,
          activityId: child.activityId,
          daycareAuto: child.daycareAuto,
          notes: child.notes,
        }}
      />
    </div>
  );
}
