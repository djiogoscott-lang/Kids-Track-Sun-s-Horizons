"use client";

import { HelpCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useOnboarding } from "@/features/onboarding/onboarding-provider";

export function HelpMenu() {
  const { start } = useOnboarding();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(event: MouseEvent) {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Aide"
        className="tap-scale flex h-9 w-9 items-center justify-center rounded-lg border border-[var(--border)] text-[var(--muted)] transition hover:border-[var(--primary)] hover:text-[var(--primary)]"
      >
        <HelpCircle size={18} />
      </button>
      {open ? (
        <div className="animate-float-in absolute right-0 top-11 z-30 w-64 rounded-2xl border border-[var(--border)] bg-white p-3 shadow-[0_12px_28px_-16px_rgba(16,33,62,0.35)]">
          <p className="px-2 py-1 text-xs font-bold uppercase tracking-wide text-[var(--muted)]">Comment utiliser l&apos;application ?</p>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              start();
            }}
            className="tap-scale mt-1 flex w-full items-center gap-2 rounded-xl px-2 py-2.5 text-left text-sm font-semibold text-[var(--foreground)] hover:bg-[var(--background)]"
          >
            ❓ Revoir le guide
          </button>
        </div>
      ) : null}
    </div>
  );
}
