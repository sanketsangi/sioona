import type { Transition, Variants } from "framer-motion";

/**
 * Shared motion config. Every animated component reads from here so pacing
 * stays consistent. Only `transform` and `opacity` are animated.
 */

/** Custom ease-out: fast start, long settle. */
export const ease = [0.22, 1, 0.36, 1] as const;

export const duration = {
  fast: 0.3,
  base: 0.45,
  slow: 0.6,
} as const;

/** Seconds between staggered children. */
export const stagger = {
  tight: 0.04,
  base: 0.08,
  loose: 0.12,
} as const;

/** Translate distances in px for reveal motion (8–16px). */
export const distance = {
  sm: 8,
  md: 12,
  lg: 16,
} as const;

/** `whileInView` options: fire once, slightly before the element is centered. */
export const viewport = {
  once: true,
  margin: "0px 0px -12% 0px",
} as const;

export const transition: Record<keyof typeof duration, Transition> = {
  fast: { duration: duration.fast, ease },
  base: { duration: duration.base, ease },
  slow: { duration: duration.slow, ease },
};

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: distance.md },
  visible: { opacity: 1, y: 0, transition: transition.base },
};

export const fadeUpLarge: Variants = {
  hidden: { opacity: 0, y: distance.lg },
  visible: { opacity: 1, y: 0, transition: transition.slow },
};

export const fade: Variants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: transition.base },
};

export const pop: Variants = {
  hidden: { opacity: 0, scale: 0.88 },
  visible: { opacity: 1, scale: 1, transition: transition.fast },
};

export const staggerContainer = (
  gap: number = stagger.base,
  delayChildren = 0,
): Variants => ({
  hidden: {},
  visible: { transition: { staggerChildren: gap, delayChildren } },
});

/** Hero product-mock script. Durations are in ms for the setTimeout chain. */
export const heroScript = {
  idle: 900,
  rowIn: 1100,
  typeCharMs: 24,
  why: 1500,
  chips: 1300,
  correct: 1600,
  acted: 3000,
  resetFade: 700,
} as const;
