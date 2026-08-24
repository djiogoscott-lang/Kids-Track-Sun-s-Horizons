import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { getSessionHistory } from "@/features/attendance/application/queries";
import { requireUser } from "@/lib/auth/require-user";
import { formatTime } from "@/lib/format";
import { getDemoState } from "@/server/demo/store";

const EVENT_LABEL: Record<string, string> = {
  ARRIVED: "Arrivée",
  PRESENT: "Présence confirmée",
  ABSENT: "Absence",
  EXCUSED: "Absence excusée",
  LEFT: "Départ",
  CORRECTION: "Correction",
  EXPECTED: "Attendu",
};

export default async function SessionHistoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser();

  const session = getDemoState().sessions.get(id);
  if (!session) notFound();
  if (user.role !== "ADMIN" && !session.monitorIds.includes(user.id)) notFound();

  const group = getDemoState().groups.find((g) => g.id === session.groupId);
  const entries = getSessionHistory(id);

  return (
    <div className="space-y-6">
      <div>
        <Link href={`/sessions/${id}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
          ← Retour à la séance
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">Historique · {group?.name}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">Chaque action est conservée : rien n&apos;est jamais réécrit, seulement corrigé.</p>
      </div>

      {entries.length === 0 ? (
        <EmptyState title="Aucun évènement pour l'instant." description="Les arrivées, absences et départs apparaîtront ici." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-[var(--border)] p-0">
            {entries.map((entry) => (
              <div key={entry.id} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-[var(--foreground)]">
                    {formatTime(entry.occurredAt)} — {EVENT_LABEL[entry.eventType] ?? entry.eventType}
                  </p>
                  <p className="text-xs text-[var(--muted)]">{entry.recordedByName}</p>
                </div>
                <p className="mt-0.5 text-sm text-[var(--muted)]">{entry.childName}</p>
                {entry.eventType === "CORRECTION" ? (
                  <div className="mt-2 rounded-lg bg-[var(--background)] px-3 py-2 text-xs text-[var(--muted)]">
                    <p>
                      Ancienne valeur : <span className="font-medium text-[var(--foreground)]">{formatValue(entry.previousValue)}</span> → Nouvelle
                      valeur : <span className="font-medium text-[var(--foreground)]">{formatValue(entry.newValue)}</span>
                    </p>
                    {entry.correctionReason ? <p className="mt-1">Motif : {entry.correctionReason}</p> : null}
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function formatValue(value: Record<string, unknown> | null): string {
  if (!value || typeof value.leftAt !== "string") return "—";
  return formatTime(new Date(value.leftAt));
}
