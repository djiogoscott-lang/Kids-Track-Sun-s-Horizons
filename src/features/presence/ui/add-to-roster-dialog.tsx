"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addChildToRosterAction, createChildAndAddToRosterAction } from "@/features/presence/ui/actions";

export interface RosterCandidateChild {
  id: string;
  firstName: string;
  lastName: string;
  activityName: string;
}

export function AddToRosterDialog({
  activityId,
  activityName,
  weekStart,
  candidateChildren,
  alreadyInRoster,
}: {
  activityId: string;
  activityName: string;
  weekStart: string;
  candidateChildren: RosterCandidateChild[];
  alreadyInRoster: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const inRosterSet = useMemo(() => new Set(alreadyInRoster), [alreadyInRoster]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return candidateChildren;
    return candidateChildren.filter((c) => `${c.firstName} ${c.lastName}`.toLowerCase().includes(q));
  }, [candidateChildren, search]);

  function open() {
    setSearch("");
    setError(null);
    dialogRef.current?.showModal();
  }

  function close() {
    dialogRef.current?.close();
  }

  function add(childId: string) {
    setError(null);
    setAddingId(childId);
    startTransition(async () => {
      const result = await addChildToRosterAction(childId, activityId, weekStart);
      setAddingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  /** Splits the search box text into a first/last name guess so the admin
   * usually only has to confirm — typing the full name to search for someone
   * who turns out not to exist yet is the exact moment this is needed. */
  const [newFirstName, newLastName] = useMemo(() => {
    const parts = search.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return ["", ""];
    if (parts.length === 1) return [parts[0], ""];
    return [parts[0], parts.slice(1).join(" ")];
  }, [search]);

  const [creatingFirst, setCreatingFirst] = useState<string | null>(null);
  const [creatingLast, setCreatingLast] = useState<string | null>(null);
  const effectiveFirst = creatingFirst ?? newFirstName;
  const effectiveLast = creatingLast ?? newLastName;

  function createAndAdd() {
    setError(null);
    startTransition(async () => {
      const result = await createChildAndAddToRosterAction(effectiveFirst, effectiveLast, activityId, weekStart);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setSearch("");
      setCreatingFirst(null);
      setCreatingLast(null);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-9 rounded-lg bg-[var(--primary)] px-3 text-xs font-bold text-white transition hover:bg-[var(--primary-strong)]"
      >
        + Ajouter
      </button>
      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ajouter à {activityName}</h2>
          <p className="text-xs text-[var(--muted)]">Un enfant ne peut appartenir qu&apos;à une seule activité par semaine — l&apos;ajouter ici le retire de tout autre roster de cette semaine.</p>

          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un enfant…"
            className="mt-4 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3.5 outline-none focus:border-[var(--primary)]"
          />

          {error ? <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-medium text-red-700">{error}</p> : null}

          <ul className="mt-4 max-h-80 space-y-1.5 overflow-y-auto">
            {filtered.length === 0 ? (
              <li className="rounded-xl border border-dashed border-[var(--border)] p-4">
                <p className="text-center text-sm text-[var(--muted)]">Aucun enfant trouvé.</p>
                {search.trim() ? (
                  <div className="mt-3 space-y-2">
                    <p className="text-xs font-semibold text-[var(--foreground)]">Créer cet enfant et l&apos;ajouter à {activityName} :</p>
                    <div className="flex gap-2">
                      <input
                        value={effectiveFirst}
                        onChange={(e) => setCreatingFirst(e.target.value)}
                        placeholder="Prénom"
                        aria-label="Prénom du nouvel enfant"
                        className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm"
                      />
                      <input
                        value={effectiveLast}
                        onChange={(e) => setCreatingLast(e.target.value)}
                        placeholder="Nom"
                        aria-label="Nom du nouvel enfant"
                        className="h-10 w-full rounded-lg border border-[var(--border)] bg-white px-2.5 text-sm"
                      />
                    </div>
                    <button
                      type="button"
                      disabled={isPending || !effectiveFirst.trim() || !effectiveLast.trim()}
                      onClick={createAndAdd}
                      className="tap-scale h-11 w-full rounded-lg bg-[var(--primary)] text-xs font-bold text-white disabled:bg-slate-200 disabled:text-[var(--muted)]"
                    >
                      {isPending ? "Création…" : "+ Créer et ajouter"}
                    </button>
                    <p className="text-[10px] text-[var(--muted)]">
                      L&apos;enfant est ajouté à la base permanente et au roster de la semaine. Aucune présence n&apos;est marquée automatiquement.
                    </p>
                  </div>
                ) : null}
              </li>
            ) : (
              filtered.map((child) => {
                const already = inRosterSet.has(child.id);
                return (
                  <li key={child.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border)] px-3.5 py-2.5">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-[var(--foreground)]">
                        {child.firstName} {child.lastName}
                      </p>
                      <p className="text-xs text-[var(--muted)]">{child.activityName}</p>
                    </div>
                    <button
                      type="button"
                      disabled={isPending || already}
                      onClick={() => add(child.id)}
                      className="tap-scale h-11 shrink-0 rounded-lg bg-[var(--primary)] px-3.5 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-[var(--muted)]"
                    >
                      {already ? `Déjà à ${activityName}` : addingId === child.id ? "Ajout…" : "Ajouter"}
                    </button>
                  </li>
                );
              })
            )}
          </ul>

          <button type="button" onClick={close} className="tap-scale mt-4 h-11 w-full rounded-xl text-sm font-semibold text-[var(--muted)]">
            Fermer
          </button>
        </div>
      </dialog>
    </>
  );
}
