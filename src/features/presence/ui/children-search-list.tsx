"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ChildActiveToggle } from "@/features/presence/ui/child-active-toggle";
import { bulkDeleteChildrenAction } from "@/features/presence/ui/actions";
import type { ChildAdminRow } from "@/features/presence/application/queries";

type SortKey = "name-asc" | "name-desc" | "created-desc" | "created-asc";

export function ChildrenSearchList({ childrenList, activityNames }: { childrenList: ChildAdminRow[]; activityNames: string[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState("ALL");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">("ALL");
  const [garderieFilter, setGarderieFilter] = useState<"ALL" | "YES" | "NO">("ALL");
  const [sort, setSort] = useState<SortKey>("name-asc");

  const [selectionMode, setSelectionMode] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [confirmText, setConfirmText] = useState("");
  const [isPending, startTransition] = useTransition();
  const [bulkError, setBulkError] = useState<string | null>(null);
  const [bulkResult, setBulkResult] = useState<{ deletedCount: number; blockedNames: string[] } | null>(null);

  const activities = useMemo(() => {
    const names = new Set([...activityNames, ...childrenList.map((c) => c.activityName)]);
    return Array.from(names).sort();
  }, [activityNames, childrenList]);

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

  function toggleSelectionMode() {
    setSelectionMode((v) => !v);
    setSelected(new Set());
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    setSelected((prev) => (prev.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id))));
  }

  function openConfirm() {
    setConfirmText("");
    setBulkError(null);
    setBulkResult(null);
    dialogRef.current?.showModal();
  }

  function closeConfirm() {
    dialogRef.current?.close();
  }

  function confirmBulkDelete() {
    setBulkError(null);
    startTransition(async () => {
      const result = await bulkDeleteChildrenAction(Array.from(selected), confirmText);
      if (!result.ok) {
        setBulkError(result.message);
        return;
      }
      setBulkResult({ deletedCount: result.deletedCount, blockedNames: result.blockedNames });
      setSelected(new Set());
      setSelectionMode(false);
      router.refresh();
    });
  }

  const selectedChildren = childrenList.filter((c) => selected.has(c.id));

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

      <div className="flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          onClick={toggleSelectionMode}
          className="tap-scale h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] hover:border-[var(--primary)]"
        >
          {selectionMode ? "Annuler la sélection" : "Mode sélection"}
        </button>
        <div className="flex items-center gap-2">
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
      </div>

      {selectionMode ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-[var(--warning-bg)] px-3.5 py-2.5">
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1.5 text-sm font-semibold text-[var(--foreground)]">
              <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleSelectAll} />
              Sélectionner tout
            </label>
            <span className="text-sm font-medium text-[var(--foreground)]">{selected.size} enfant{selected.size > 1 ? "s" : ""} sélectionné{selected.size > 1 ? "s" : ""}</span>
          </div>
          <button
            type="button"
            disabled={selected.size === 0}
            onClick={openConfirm}
            className="tap-scale h-9 rounded-lg bg-[var(--danger)] px-3 text-xs font-bold text-white disabled:opacity-40"
          >
            🗑️ Supprimer définitivement
          </button>
        </div>
      ) : null}

      {bulkResult ? (
        <div className="rounded-xl bg-[var(--success-bg)] px-3.5 py-2.5 text-sm text-[var(--foreground)]">
          <p className="font-semibold">✅ {bulkResult.deletedCount} enfant{bulkResult.deletedCount > 1 ? "s" : ""} supprimé{bulkResult.deletedCount > 1 ? "s" : ""}.</p>
          {bulkResult.blockedNames.length > 0 ? (
            <p className="mt-1 text-[var(--danger)]">
              ⚠️ {bulkResult.blockedNames.length} enfant{bulkResult.blockedNames.length > 1 ? "s" : ""} non supprimé{bulkResult.blockedNames.length > 1 ? "s" : ""} (historique de présence) : {bulkResult.blockedNames.join(", ")}. Utilisez Désactiver pour ceux-ci.
            </p>
          ) : null}
        </div>
      ) : null}

      {childrenList.length === 0 ? (
        <EmptyState title="Aucun enfant enregistré pour l'instant." />
      ) : filtered.length === 0 ? (
        <EmptyState title="Aucun enfant ne correspond à cette recherche." />
      ) : (
        <Card>
          <CardContent className="divide-y divide-[var(--border)] p-0">
            {filtered.map((child) => (
              <div key={child.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                <div className="flex items-center gap-3">
                  {selectionMode ? (
                    <input
                      type="checkbox"
                      checked={selected.has(child.id)}
                      onChange={() => toggleOne(child.id)}
                      className="h-5 w-5 shrink-0"
                      aria-label={`Sélectionner ${child.firstName} ${child.lastName}`}
                    />
                  ) : null}
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
                </div>
                {!selectionMode ? (
                  <div className="flex items-center gap-2">
                    <Link href={`/admin/children/${child.id}`} className="text-sm font-semibold text-[var(--primary)] hover:underline">
                      Modifier
                    </Link>
                    <ChildActiveToggle childId={child.id} active={child.active} />
                  </div>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <dialog ref={dialogRef} className="w-full max-w-sm rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="p-6">
          <h2 className="text-lg font-bold text-[var(--danger)]">Suppression multiple</h2>
          <p className="mt-2 text-sm text-[var(--foreground)]">
            Vous avez sélectionné <strong>{selectedChildren.length}</strong> enfant{selectedChildren.length > 1 ? "s" : ""}.
          </p>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Cette action peut être irréversible. Les enfants ayant un historique de présence ne pourront pas être supprimés définitivement — utilisez Désactiver pour ceux-ci.
          </p>
          <label className="mt-4 block text-sm font-semibold">
            Tapez SUPPRIMER pour confirmer
            <input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              className="mt-1.5 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--danger)]"
              autoComplete="off"
            />
          </label>
          {bulkError ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{bulkError}</p> : null}
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              disabled={isPending || confirmText.trim().toUpperCase() !== "SUPPRIMER"}
              onClick={confirmBulkDelete}
              className="tap-scale h-12 flex-1 rounded-xl bg-[var(--danger)] text-sm font-bold text-white disabled:opacity-40"
            >
              {isPending ? "Suppression…" : "Supprimer définitivement"}
            </button>
            <button type="button" onClick={closeConfirm} className="tap-scale h-12 rounded-xl px-4 text-sm font-semibold text-[var(--muted)]">
              Annuler
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
