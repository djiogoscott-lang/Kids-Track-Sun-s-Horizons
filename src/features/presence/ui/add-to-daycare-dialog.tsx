"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addChildToDaycareAction } from "@/features/presence/ui/actions";
import type { ChildPickerRow } from "@/features/presence/application/queries";

export function AddToDaycareDialog({
  candidateChildren,
  currentlyInDaycare,
}: {
  candidateChildren: ChildPickerRow[];
  currentlyInDaycare: string[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [addingId, setAddingId] = useState<string | null>(null);
  const inDaycareSet = useMemo(() => new Set(currentlyInDaycare), [currentlyInDaycare]);

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
      const result = await addChildToDaycareAction(childId);
      setAddingId(null);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={open}
        className="tap-scale h-11 rounded-xl bg-[var(--primary)] px-4 text-sm font-bold text-white transition hover:bg-[var(--primary-strong)]"
      >
        + Ajouter un enfant
      </button>
      <dialog ref={dialogRef} className="w-full max-w-md rounded-3xl border border-[var(--border)] p-0 shadow-xl backdrop:bg-black/40">
        <div className="max-h-[85vh] overflow-y-auto p-6">
          <h2 className="text-xl font-bold text-[var(--foreground)]">Ajouter un enfant à la garderie</h2>

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
              <li className="py-6 text-center text-sm text-[var(--muted)]">Aucun enfant trouvé.</li>
            ) : (
              filtered.map((child) => {
                const already = inDaycareSet.has(child.id);
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
                      {already ? "Déjà en garderie" : addingId === child.id ? "Ajout…" : "Ajouter"}
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
