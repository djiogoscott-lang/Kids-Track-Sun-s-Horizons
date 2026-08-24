import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getDaycareList } from "@/features/presence/application/queries";
import { CounterBar } from "@/features/presence/ui/counter-bar";
import { DaycareRowItem } from "@/features/presence/ui/daycare-row";
import { requireUser } from "@/lib/auth/require-user";
import { formatTime } from "@/lib/format";

export default async function GarderiePage() {
  await requireUser();
  const now = new Date();
  const children = getDaycareList(now);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">🏠 Garderie</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Situation à {formatTime(now)}, toutes activités confondues.</p>
      </div>

      <CounterBar items={[{ value: children.length, label: "Enfants actuellement présents", tone: "primary" }]} />

      {children.length === 0 ? (
        <EmptyState icon="👌" title="Personne en garderie pour l'instant." />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul>
              {children.map((child) => (
                <DaycareRowItem key={child.childId} child={child} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
