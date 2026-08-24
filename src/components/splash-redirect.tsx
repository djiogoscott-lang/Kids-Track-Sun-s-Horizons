"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

export function SplashRedirect({ href, delayMs = 1100 }: { href: string; delayMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => router.replace(href), delayMs);
    return () => clearTimeout(timer);
  }, [href, delayMs, router]);

  return null;
}
