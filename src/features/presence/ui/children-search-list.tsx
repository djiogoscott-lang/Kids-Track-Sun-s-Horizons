"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildActiveToggle } from "@/features/presence/ui/child-active-toggle";
import type { ChildAdminRow } from "@/features/presence/application/queries";

type SortKey = "name-asc" | "name-desc" | "created-desc" | "created-asc";

export function ChildrenSearchList({ childrenList }: { childrenList: ChildAdminRow[] }) {
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("ALL");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [garderieFilter, setGarderieFilter] = useState<"ALL" | "YES" | "NO">("ALL");
  const [sort, setSort] = useState<SortKey>("name-asc");

  const activities = useMemo(() => {
    const names = new Set(childrenList.map((c) => c.activityName));
    return Array.from(names).sort();
  }, [childrenList]);

  const filtered = childrenList
    .filter((child) => {
      const matchesActivity = activityFilter === "ALL" || child.activityName === activityFilter;
      const matchesActive = activeFilter === "ALL" || (activeFilter === "ACTIVE" ? child.active : !child.active);
      const matchesGarderie = garderieFilter === "ALL" || (garderieFilter === "YES" ? child.daycareAuto : !child.daycareAuto);
      const fullName = `${child.firstName} ${child.lastName}`.toLowerCase();
      const matchesQuery = query.trim() === "" || fullName.includes(query.trim().toLowerCase());
      return matchesActivity && matchesActive && matchesGarderie && matchesQuery;
    })
    .sort((a, b) => {
      switch (sort) {
        case "name-asc":
          return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
        case "name-desc":
          return `${b.lastName}${b.firstName}`.localeCompare(`${a.lastName}${a.firstName}`);
        case "created-desc":
          return b.createdAt.getTime() - a.createdAt.getTime();
        case "created-asc":
          return a.createdAt.getTime() - b.createdAt.getTime();
      }
    });

  return (
    <div className="space-y-4">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="🔎 Rechercher un enfant…"
          aria-label="Rechercher un enfant"
          className="h-11 rounded-xl border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)] lg:col-span-2"
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
        <select
          value={activeFilter}
          onChange={(e) => setActiveFilter(e.target.value as typeof activeFilter)}
          aria-label="Filtrer par statut"
          className="h-11 rounded-xl border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="ACTIVE">Actifs</option>
          <option value="INACTIVE">Désactivés</option>
        </select>
        <select
          value={garderieFilter}
          onChange={(e) => setGarderieFilter(e.target.value as typeof garderieFilter)}
          aria-label="Filtrer par garderie"
          className="h-11 rounded-xl border border-[var(--border)] bg-white px-3.5 text-sm text-[var(--foreground)] outline-none focus:border-[var(--primary)]"
        >
          <option value="ALL">Garderie : tous</option>
          <option value="YES">Garderie : oui</option>
          <option value="NO">Garderie : non</option>
        </select>
      </div>

      <div className="flex items-center justify-end gap-2">
        <label className="text-xs font-semibold text-[var(--muted)]" htmlFor="children-sort">
          Trier par
        </label>
        <select
          id="children-sort"
          value={sort}
          onChange={(e) => setSort(e.target.value as SortKey)}
          className="h-9 rounded-lg border border-[var(--border)] bg-white px-2.5 text-xs font-medium text-[var(--foreground)]"
        >
          <option value="name-asc">Nom (A→Z)</option>
          <option value="name-desc">Nom (Z→A)</option>
          <option value="created-desc">Plus récents</option>
          <option value="created-asc">Plus anciens</option>
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
                    {child.daycareAuto ? " · Garderie" : ""}
                    {!child.active ? " · Désactivé" : ""}
                    {child.isDemo ? " · Démo" : ""}
                    {child.createdAt.getTime() > 0 ? ` · ajouté le ${child.createdAt.toLocaleDateString("fr-BE")}` : ""}
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
