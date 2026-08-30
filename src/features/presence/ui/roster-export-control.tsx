"use client";

import { useState } from "react";

export function RosterExportControl({ weekStart, activities }: { weekStart: string; activities: Array<{ id: string; name: string }> }) {
  const [activityId, setActivityId] = useState("");

  const href = activityId ? `/api/admin/roster/export?weekStart=${weekStart}&activityId=${activityId}` : `/api/admin/roster/export?weekStart=${weekStart}`;

  return (
    <div className="flex h-11 items-center gap-1.5 rounded-xl border border-[var(--border)] bg-white px-2">
      <select
        value={activityId}
        onChange={(e) => setActivityId(e.target.value)}
        aria-label="Activité à exporter"
        className="h-8 rounded-lg border-none bg-transparent text-sm font-semibold text-[var(--foreground)] outline-none"
      >
        <option value="">Toutes les activités</option>
        {activities.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <a href={href} className="tap-scale flex h-8 items-center rounded-lg px-2 text-sm font-semibold text-[var(--primary)] hover:underline">
        📤 Exporter
      </a>
    </div>
  );
}
