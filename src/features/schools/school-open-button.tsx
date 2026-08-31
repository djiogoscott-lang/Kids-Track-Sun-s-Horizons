"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchSchoolAction } from "@/features/schools/actions";

/** Makes a school the working context and lands on its activities. */
export function SchoolOpenButton({ schoolId, isActive }: { schoolId: string; isActive: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function open() {
    setError(null);
    startTransition(async () => {
      const result = await switchSchoolAction(schoolId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/activities");
    });
  }

  return (
    <div className="flex flex-col items-end">
      <button
        type="button"
        disabled={isPending}
        onClick={open}
        className="tap-scale h-9 rounded-lg bg-[var(--foreground)] px-3 text-xs font-bold text-white disabled:opacity-50"
      >
        {isPending ? "Ouverture…" : isActive ? "Ouvrir" : "Ouvrir cette école"}
      </button>
      {error ? <p className="mt-1 text-[10px] font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
