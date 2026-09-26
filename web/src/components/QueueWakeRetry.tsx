"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  BACKEND_HEALTH_PATH,
  SCORE_WAITING_LINE,
  clearBackendWakeAttempt,
  wakeBackendAndRefresh,
} from "@/lib/backend-wake";

/**
 * On queue/score miss: ping /api/backend-health (wakes Render), then refresh once.
 */
export function QueueWakeRetry({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!active) {
      clearBackendWakeAttempt(window.sessionStorage);
      return;
    }

    void wakeBackendAndRefresh({
      storage: window.sessionStorage,
      now: Date.now(),
      fetchHealth: () => fetch(BACKEND_HEALTH_PATH, { cache: "no-store" }),
      refresh: () => router.refresh(),
    });
  }, [active, router]);

  if (!active) return null;

  return (
    <p className="sr-only" aria-live="polite">
      {SCORE_WAITING_LINE}
    </p>
  );
}
