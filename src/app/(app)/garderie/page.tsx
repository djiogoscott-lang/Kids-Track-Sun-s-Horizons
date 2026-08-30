import { Home } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getActivityIdForMonitor, getDaycareList, listChildrenForDaycarePicker } from "@/features/presence/application/queries";
import { AddToDaycareDialog } from "@/features/presence/ui/add-to-daycare-dialog";
import { CounterBar } from "@/features/presence/ui/counter-bar";
import { DaycareRowItem } from "@/features/presence/ui/daycare-row";
import { requireUser } from "@/lib/auth/require-user";
import { formatTime } from "@/lib/format";

export default async function GarderiePage() {
  const user = await requireUser();
  const now = new Date();
  // A monitor only ever sees their own activity's daycare children — only
  // an admin needs (and gets) the cross-activity view. The same scope feeds
  // both the daycare list and the "+ Ajouter un enfant" picker, so a monitor
  // is never even shown another activity's child to pick from.
  const activityId = user.role === "MONITOR" ? (await getActivityIdForMonitor(user.id)) ?? undefined : undefined;
  const [children, pickerChildren] = await Promise.all([
    getDaycareList(now, activityId),
    listChildrenForDaycarePicker(activityId),
  ]);

  return (
    <div className="animate-float-in space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl"
            style={{ backgroundColor: "var(--tint-blue-bg)", color: "var(--brand-blue)" }}
          >
            <Home size={24} strokeWidth={2} />
          </span>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Garderie</h1>
            <p className="text-sm text-[var(--muted)]">
              Situation à {formatTime(now)}{user.role === "ADMIN" ? ", toutes activités confondues." : "."}
            </p>
          </div>
        </div>
        <AddToDaycareDialog candidateChildren={pickerChildren} currentlyInDaycare={children.map((c) => c.childId)} />
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
