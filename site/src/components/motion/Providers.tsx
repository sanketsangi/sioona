"use client";

import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import { useEffect, type ReactNode } from "react";
import { stopCursorRefStrip } from "@/lib/cursor-ref-hydration";

/**
 * Global motion provider. `reducedMotion="user"` turns transform/layout motion
 * off for people who prefer reduced motion; content and opacity stay.
 * `domAnimation` keeps the client bundle small (no drag/layout features).
 */
export function MotionProviders({ children }: { children: ReactNode }) {
  useEffect(() => {
    stopCursorRefStrip();
  }, []);

  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
