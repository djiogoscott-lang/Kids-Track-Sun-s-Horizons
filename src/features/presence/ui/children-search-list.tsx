"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildActiveToggle } from "@/features/presence/ui/child-active-toggle";
import type { ChildAdminRow } from "@/features/presence/application/queries";

export function ChildrenSearchList({ childrenList }: { childrenList: ChildAdminRow[] }) {
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("ALL");

  const activities = useMemo(() => {
    const names = new Set(childrenList.map((c) => c.activityName));
    return Array.from(names).sort();
  }, [childrenList]);

  const filtered = childrenList.filter((child) => {
    const matchesActivity = activityFilter === "ALL" || child.activityName === activityFilter;
    const fullName = `${child.firstName} ${child.lastName}`.toLowerCase();
    const matchesQuery = query.trim() === "" || fullName.includes(query.trim().toLowerCase());
    return matchesActivity && matchesQuery;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2.5 sm:flex-row">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Rechercher un enfant…"
          aria-label="Rechercher un enfant"
          className="h-11 flex-1 rounded-xl border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
        />
        <select
          value={activityFilter}
          onChange={(e) => setActivityFilter(e.target.value)}
          aria-label="Filtrer par activité"
          className="h-11 rounded-xl border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
        >
          <option value="ALL">Toutes les activités</option>
          {activities.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {childrenList.length === 0 ? (
        <EmptyState title="Aucun enfant enregistré pour l'instant." />
      ) : filtered.length === 0 ? (
        <EmptyState title="Aucun enfant ne correspond à cette recherche." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-[var(--border)] p-0">
            {filtered.map((child) => (
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
      )}
    </div>
  );
}
