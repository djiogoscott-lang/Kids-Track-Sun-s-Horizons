import Link from "next/link";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import type { SessionSummary } from "@/features/attendance/application/queries";
import { formatTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const STATUS_LABEL: Record<SessionSummary["status"], { label: string; className: string }> = {
  SCHEDULED: { label: "À venir", className: "bg-slate-100 text-slate-600" },
  ACTIVE: { label: "En cours", className: "bg-[#e4f8ef] text-[#0d6b47]" },
  CLOSED: { label: "Clôturée", className: "bg-[#eef1f6] text-[#3d4b61]" },
};

export function SessionCard({ session }: { session: SessionSummary }) {
  const status = STATUS_LABEL[session.status];
  const expectedTotal = session.counters.expected + session.counters.present + session.counters.absent + session.counters.excused + session.counters.left;

  return (
    <Link href={`/sessions/${session.id}`} className="block">
      <Card className="h-full transition hover:border-[var(--primary)] hover:shadow-md">
        <CardHeader className="flex items-start justify-between gap-2">
          <div>
            <p className="font-semibold text-[var(--foreground)]">{session.groupName}</p>
            <p className="text-xs text-[var(--muted)]">{session.ageRange} · {session.location}</p>
          </div>
          <span className={cn("shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold", status.className)}>{status.label}</span>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--muted)]">
            {formatTime(session.startsAt)} – {formatTime(session.endsAt)}
          </p>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted)]">
            <span><strong className="text-[var(--foreground)]">{expectedTotal}</strong> attendus</span>
            <span className="text-[var(--success)]"><strong>{session.counters.present}</strong> présents</span>
            <span className="text-[var(--danger)]"><strong>{session.counters.absent}</strong> absents</span>
            {session.counters.late > 0 ? <span className="text-[#8a5a12]"><strong>{session.counters.late}</strong> retards</span> : null}
            {session.counters.expected > 0 ? <span><strong>{session.counters.expected}</strong> à traiter</span> : null}
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">{session.monitorNames.join(", ")}</p>
        </CardContent>
      </Card>
    </Link>
  );
}
