"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function ActivityTabs({
  morning,
  evening,
  defaultTab = "morning",
}: {
  morning: React.ReactNode;
  evening: React.ReactNode;
  defaultTab?: "morning" | "evening";
}) {
  const [tab, setTab] = useState<"morning" | "evening">(defaultTab);

  return (
    <div>
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Moment de la journée">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "morning"}
          onClick={() => setTab("morning")}
          className={cn(
            "h-12 flex-1 rounded-2xl text-sm font-bold transition-colors",
            tab === "morning" ? "bg-[var(--primary)] text-white" : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          ☀️ Présences
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "evening"}
          onClick={() => setTab("evening")}
          className={cn(
            "h-12 flex-1 rounded-2xl text-sm font-bold transition-colors",
            tab === "evening" ? "bg-[var(--primary)] text-white" : "border-2 border-[var(--border)] bg-white text-[var(--muted)]",
          )}
        >
          🌙 Départs
        </button>
      </div>
      <div role="tabpanel">{tab === "morning" ? morning : evening}</div>
    </div>
  );
}
