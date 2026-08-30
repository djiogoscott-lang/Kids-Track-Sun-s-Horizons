"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { removeChildFromRosterAction } from "@/features/presence/ui/actions";

export function RosterParticipantRow({ childId, name, weekStart }: { childId: string; name: string; weekStart: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [removed, setRemoved] = useState(false);

  if (removed) return null;

  return (
    <li className="flex items-center justify-between gap-3 px-4 py-2.5">
      <span className="text-sm font-semibold text-[var(--foreground)]">{name}</span>
      <div className="flex items-center gap-2">
        {error ? <span className="text-xs font-medium text-[var(--danger)]">{error}</span> : null}
        <button
          type="button"
          disabled={isPending}
          onClick={() => {
            setError(null);
            startTransition(async () => {
              const result = await removeChildFromRosterAction(childId, weekStart);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              setRemoved(true);
              router.refresh();
            });
          }}
          className="tap-scale h-9 shrink-0 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--danger)] hover:border-[var(--danger)] disabled:opacity-50"
        >
          Retirer
        </button>
      </div>
    </li>
  );
}
