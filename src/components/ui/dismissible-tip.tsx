"use client";

import { X } from "lucide-react";
import { useState, useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/** Shows once per browser per storageKey, then stays gone — a nudge, not a nag. */
export function DismissibleTip({ storageKey, children }: { storageKey: string; children: React.ReactNode }) {
  // localStorage is genuinely external state; useSyncExternalStore reads it
  // without the extra render pass a useEffect+setState mirror would cost,
  // and correctly renders nothing (hidden) during the server pass.
  const dismissed = useSyncExternalStore(
    noopSubscribe,
    () => localStorage.getItem(storageKey) !== null,
    () => true,
  );
  const [justDismissed, setJustDismissed] = useState(false);

  if (dismissed || justDismissed) return null;

  function dismiss() {
    localStorage.setItem(storageKey, "1");
    setJustDismissed(true);
  }

  return (
    <div className="animate-float-in flex items-start gap-2 rounded-2xl bg-[var(--secondary-bg)] px-4 py-3 text-sm text-[var(--foreground)]">
      <span aria-hidden="true">💡</span>
      <p className="flex-1">{children}</p>
      <button type="button" onClick={dismiss} aria-label="Fermer le conseil" className="tap-scale shrink-0 text-[var(--muted)]">
        <X size={16} />
      </button>
    </div>
  );
}
