"use client";

import { ChevronUp } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import type { OnboardingStep } from "@/features/onboarding/steps";

function findVisibleTargetRect(tourId: string): DOMRect | null {
  const candidates = document.querySelectorAll(`[data-tour="${tourId}"]`);
  for (const el of candidates) {
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) return rect;
  }
  return null;
}

/**
 * The controls panel is always a fixed bottom sheet, never positioned
 * relative to the spotlighted element. A previous version placed it above
 * or below the target based on its screen position, which on small phones
 * could push Suivant/Retour/Passer off-screen or under the target itself.
 * Pinning it to the bottom guarantees the controls are always reachable.
 */
export function TourOverlay({
  steps,
  stepIndex,
  onNext,
  onBack,
  onSkip,
}: {
  steps: OnboardingStep[];
  stepIndex: number;
  onNext: () => void;
  onBack: () => void;
  onSkip: () => void;
}) {
  const step = steps[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === steps.length - 1;
  const [rect, setRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!step.target) {
      // setTimeout, not requestAnimationFrame: rAF is tied to the paint
      // cycle and browsers throttle or fully pause it on a backgrounded
      // tab, which is exactly when a fresh login (and this tour) can happen.
      const id = setTimeout(() => setRect(null), 0);
      return () => clearTimeout(id);
    }

    function measure() {
      const target = document.querySelector(`[data-tour="${step.target}"]`);
      if (!target) {
        setRect(null);
        return;
      }
      // Keep the target in the upper ~third of the screen so the bottom
      // sheet below never has to cover it, instead of scrollIntoView's
      // "center", which on a short phone screen can land the target right
      // behind the sheet.
      const current = target.getBoundingClientRect();
      const desiredCenter = window.innerHeight * 0.32;
      const delta = current.top + current.height / 2 - desiredCenter;
      if (Math.abs(delta) > 4) window.scrollBy({ top: delta, behavior: "auto" });
      setRect(findVisibleTargetRect(step.target!));
    }

    const id = setTimeout(measure, 0);
    window.addEventListener("resize", measure);
    return () => {
      clearTimeout(id);
      window.removeEventListener("resize", measure);
    };
  }, [step.target]);

  const padding = 8;
  const spotlightStyle: React.CSSProperties | null = rect
    ? {
        position: "fixed",
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
        borderRadius: 20,
        boxShadow: "0 0 0 9999px rgba(10, 15, 30, 0.6)",
        border: "2px solid var(--primary)",
        pointerEvents: "none",
        transition: "top 200ms ease, left 200ms ease, width 200ms ease, height 200ms ease",
      }
    : null;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Guide de découverte">
      {!rect ? <div className="fixed inset-0 bg-[rgba(10,15,30,0.6)]" /> : <div style={spotlightStyle ?? undefined} />}

      <div className="animate-float-in fixed inset-x-0 bottom-0 z-10 max-h-[70vh] overflow-y-auto rounded-t-3xl bg-white px-5 pt-3 shadow-[0_-12px_40px_rgba(10,15,30,0.35)]" style={{ paddingBottom: "max(20px, env(safe-area-inset-bottom))" }}>
        {rect ? (
          <div className="flex justify-center text-[var(--primary)]" aria-hidden="true">
            <ChevronUp size={18} />
          </div>
        ) : null}
        <p className="text-3xl">{step.icon}</p>
        <h2 className="font-heading mt-2 text-lg font-bold text-[var(--foreground)]">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>

        <div className="mt-4 flex items-center justify-between">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i === stepIndex ? "var(--brand-purple)" : "var(--border)" }}
              />
            ))}
          </div>
          {!isLast ? (
            <button type="button" onClick={onSkip} className="h-11 px-2 text-xs font-semibold text-[var(--muted)]">
              Passer
            </button>
          ) : null}
        </div>

        <div className="mt-2 flex items-center gap-2">
          {!isFirst ? (
            <button
              type="button"
              onClick={onBack}
              className="h-12 rounded-xl border border-[var(--border)] px-4 text-sm font-semibold text-[var(--foreground)]"
            >
              Retour
            </button>
          ) : null}
          <Button type="button" onClick={onNext} className="h-12 flex-1 text-sm">
            {isLast ? "Terminer" : "Suivant"}
          </Button>
        </div>
      </div>
    </div>
  );
}
