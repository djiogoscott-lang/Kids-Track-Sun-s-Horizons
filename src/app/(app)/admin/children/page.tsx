import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listChildrenForAdmin } from "@/features/presence/application/queries";
import { ChildrenSearchList } from "@/features/presence/ui/children-search-list";
import { requireUser } from "@/lib/auth/require-user";

export default async function AdminChildrenPage() {
  await requireUser("ADMIN");
  const children = await listChildrenForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Enfants</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{children.length} enfant{children.length > 1 ? "s" : ""} enregistré{children.length > 1 ? "s" : ""}.</p>
        </div>
        <Link href="/admin/children/new">
          <Button type="button">+ Ajouter un enfant</Button>
        </Link>
      </div>

      <ChildrenSearchList childrenList={children} />
    </div>
  );
}
