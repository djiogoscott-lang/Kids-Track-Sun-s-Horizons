import Link from "next/link";
import { Button } from "@/components/ui/button";
import { listChildrenForAdmin } from "@/features/presence/application/queries";
import { ChildrenSearchList } from "@/features/presence/ui/children-search-list";
import { ExcelImportDialog } from "@/features/presence/ui/excel-import-dialog";
import { requireUser } from "@/lib/auth/require-user";
import { getActivitiesList } from "@/server/data-source";

export default async function AdminChildrenPage() {
  await requireUser("ADMIN");
  const [children, activities] = await Promise.all([listChildrenForAdmin(), getActivitiesList()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Enfants</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{children.length} enfant{children.length > 1 ? "s" : ""} enregistré{children.length > 1 ? "s" : ""}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <a
            href="/api/admin/children/template"
            className="tap-scale flex h-11 items-center rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]"
          >
            📄 Modèle Excel
          </a>
          <a
            href="/api/admin/children/export"
            className="tap-scale flex h-11 items-center rounded-xl border border-[var(--border)] bg-white px-4 text-sm font-semibold text-[var(--foreground)] transition hover:border-[var(--primary)]"
          >
            📤 Exporter Excel
          </a>
          <ExcelImportDialog />
          <Link href="/admin/children/new">
            <Button type="button">+ Ajouter un enfant</Button>
          </Link>
        </div>
      </div>

      <ChildrenSearchList childrenList={children} activityNames={activities.map((a) => a.name)} />
    </div>
  );
}
