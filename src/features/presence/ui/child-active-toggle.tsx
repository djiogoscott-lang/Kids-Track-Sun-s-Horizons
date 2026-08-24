"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { setChildActiveAction } from "@/features/presence/ui/actions";

export function ChildActiveToggle({ childId, active }: { childId: string; active: boolean }) {
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          await setChildActiveAction(childId, !active);
          router.refresh();
        })
      }
      className="h-9 rounded-lg border border-[var(--border)] bg-white px-3 text-xs font-semibold text-[var(--foreground)] transition hover:border-[var(--danger)] disabled:opacity-50"
    >
      {active ? "Désactiver" : "Réactiver"}
    </button>
  );
}
