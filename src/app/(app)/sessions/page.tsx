import { EmptyState } from "@/components/ui/empty-state";
import { listSessionsForUser } from "@/features/attendance/application/queries";
import { SessionCard } from "@/features/attendance/ui/session-card";
import { requireUser } from "@/lib/auth/require-user";
import { formatDateLong } from "@/lib/format";

export default async function SessionsPage() {
  const user = await requireUser();
  const sessions = listSessionsForUser(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-[var(--foreground)] sm:text-3xl">
          {user.role === "ADMIN" ? "Séances" : "Mes séances"}
        </h1>
        <p className="mt-1 text-sm text-[var(--muted)]">{formatDateLong(new Date())}</p>
      </div>

      {sessions.length === 0 ? (
        <EmptyState title="Aucune séance aujourd'hui." description="Vous êtes à jour 👌" />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sessions.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </div>
  );
}
