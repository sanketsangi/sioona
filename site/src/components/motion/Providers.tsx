"use client";

import { LazyMotion, MotionConfig, domAnimation } from "framer-motion";
import type { ReactNode } from "react";

/**
 * Global motion provider. `reducedMotion="user"` turns transform/layout motion
 * off for people who prefer reduced motion; content and opacity stay.
 * `domAnimation` keeps the client bundle small (no drag/layout features).
 */
export function MotionProviders({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LazyMotion features={domAnimation} strict>
        {children}
      </LazyMotion>
    </MotionConfig>
  );
}
