"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { switchSchoolAction } from "@/features/schools/actions";

export interface SwitcherSchool {
  schoolId: string;
  name: string;
  active: boolean;
}

/**
 * Only rendered when the user belongs to more than one school — someone with
 * a single school has nothing to choose and should not be shown a control
 * that implies otherwise.
 */
export function SchoolSwitcher({ schools, activeSchoolId }: { schools: SwitcherSchool[]; activeSchoolId: string | null }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (schools.length < 2) return null;

  function switchTo(schoolId: string) {
    if (schoolId === activeSchoolId) return;
    setError(null);
    startTransition(async () => {
      const result = await switchSchoolAction(schoolId);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-start">
      <label className="sr-only" htmlFor="school-switcher">
        École active
      </label>
      <select
        id="school-switcher"
        value={activeSchoolId ?? ""}
        disabled={isPending}
        onChange={(e) => switchTo(e.target.value)}
        className="h-9 max-w-[13rem] rounded-lg border border-[var(--border)] bg-white px-2.5 text-xs font-semibold text-[var(--foreground)] disabled:opacity-50"
      >
        {schools.map((s) => (
          <option key={s.schoolId} value={s.schoolId}>
            🏫 {s.name}
            {s.active ? "" : " (inactive)"}
          </option>
        ))}
      </select>
      {error ? <p className="mt-1 text-[10px] font-medium text-[var(--danger)]">{error}</p> : null}
    </div>
  );
}
