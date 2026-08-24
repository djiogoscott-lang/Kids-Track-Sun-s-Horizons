"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { OnboardingStep } from "@/features/onboarding/steps";
import { TourOverlay } from "@/features/onboarding/tour-overlay";

interface OnboardingContextValue {
  start: () => void;
}

const OnboardingContext = createContext<OnboardingContextValue | null>(null);

export function useOnboarding(): OnboardingContextValue {
  const ctx = useContext(OnboardingContext);
  if (!ctx) throw new Error("useOnboarding must be used within OnboardingProvider");
  return ctx;
}

function storageKey(userId: string) {
  return `kt_onboarding_seen_${userId}`;
}

export function OnboardingProvider({
  userId,
  steps,
  children,
}: {
  userId: string;
  steps: OnboardingStep[];
  children: React.ReactNode;
}) {
  const [stepIndex, setStepIndex] = useState<number | null>(null);

  useEffect(() => {
    if (!localStorage.getItem(storageKey(userId))) {
      const timer = setTimeout(() => setStepIndex(0), 500);
      return () => clearTimeout(timer);
    }
  }, [userId]);

  function finish() {
    localStorage.setItem(storageKey(userId), "1");
    setStepIndex(null);
  }

  const value = useMemo<OnboardingContextValue>(() => ({ start: () => setStepIndex(0) }), []);

  return (
    <OnboardingContext.Provider value={value}>
      {children}
      {stepIndex !== null ? (
        <TourOverlay
          steps={steps}
          stepIndex={stepIndex}
          onNext={() => (stepIndex + 1 >= steps.length ? finish() : setStepIndex(stepIndex + 1))}
          onBack={() => setStepIndex(Math.max(0, stepIndex - 1))}
          onSkip={finish}
        />
      ) : null}
    </OnboardingContext.Provider>
  );
}
