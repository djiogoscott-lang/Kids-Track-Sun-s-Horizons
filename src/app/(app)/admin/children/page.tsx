import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { listChildrenForAdmin } from "@/features/presence/application/queries";
import { ChildActiveToggle } from "@/features/presence/ui/child-active-toggle";
import { requireUser } from "@/lib/auth/require-user";

export default async function AdminChildrenPage() {
  await requireUser("ADMIN");
  const children = listChildrenForAdmin();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Enfants</h1>
          <p className="mt-1 text-sm text-[var(--muted)]">{children.length} enfant{children.length > 1 ? "s" : ""} enregistré{children.length > 1 ? "s" : ""}.</p>
        </div>
        <Link href="/admin/children/new">
          <Button type="button">+ Ajouter un enfant</Button>
        </Link>
      </div>

      <Card>
        <CardContent className="divide-y divide-[var(--border)] p-0">
          {children.map((child) => (
            <div key={child.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className={`font-semibold ${child.active ? "text-[var(--foreground)]" : "text-[var(--muted)] line-through"}`}>
                  {child.firstName} {child.lastName}
                </p>
                <p className="text-xs text-[var(--muted)]">
                  {child.activityName}
                  {child.daycareAuto ? " · Garderie automatique" : ""}
                  {!child.active ? " · Désactivé" : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/admin/children/${child.id}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
                  Modifier
                </Link>
                <ChildActiveToggle childId={child.id} active={child.active} />
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
