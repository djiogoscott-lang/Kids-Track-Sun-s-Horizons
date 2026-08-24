"use client";

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
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    if (!step.target) {
      // setTimeout, not requestAnimationFrame: rAF is tied to the paint
      // cycle and browsers throttle or fully pause it on a backgrounded
      // tab, which is exactly when a fresh login (and this tour) can happen.
      const id = setTimeout(() => setRect(null), 0);
      return () => clearTimeout(id);
    }
    const target = document.querySelector(`[data-tour="${step.target}"]`);
    target?.scrollIntoView({ block: "center", behavior: "auto" });

    const measure = () => setRect(findVisibleTargetRect(step.target!));
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

  const tooltipTop = rect ? (rect.top > window.innerHeight / 2 ? undefined : rect.bottom + padding + 12) : undefined;
  const tooltipBottom = rect && rect.top > window.innerHeight / 2 ? window.innerHeight - rect.top + padding + 12 : undefined;

  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Guide de découverte">
      {!rect ? <div className="fixed inset-0 bg-[rgba(10,15,30,0.6)]" /> : <div style={spotlightStyle ?? undefined} />}

      <div
        className="animate-float-in fixed inset-x-4 z-10 mx-auto max-w-sm rounded-3xl bg-white p-5 shadow-[0_20px_60px_rgba(10,15,30,0.35)]"
        style={
          rect
            ? { top: tooltipTop, bottom: tooltipBottom }
            : { top: "50%", transform: "translateY(-50%)" }
        }
      >
        <p className="text-3xl">{step.icon}</p>
        <h2 className="font-heading mt-2 text-lg font-bold text-[var(--foreground)]">{step.title}</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{step.body}</p>

        <div className="mt-4 flex items-center justify-between gap-2">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <span
                key={i}
                className="h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: i === stepIndex ? "var(--brand-purple)" : "var(--border)" }}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {!isLast ? (
              <button type="button" onClick={onSkip} className="h-10 px-2 text-xs font-semibold text-[var(--muted)]">
                Passer
              </button>
            ) : null}
            {!isFirst ? (
              <button
                type="button"
                onClick={onBack}
                className="h-10 rounded-lg border border-[var(--border)] px-3 text-xs font-semibold text-[var(--foreground)]"
              >
                Retour
              </button>
            ) : null}
            <Button type="button" onClick={onNext} className="h-10 px-4 text-xs">
              {isLast ? "Terminer" : "Suivant"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
