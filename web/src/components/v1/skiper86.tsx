"use client";

/**
 * Skiper UI skiper86 — AppleBorderGradient.
 * Public API matches @skiper-ui/skiper86 (preview / intensity / className).
 * Gradient stops use sio tokens (quiet product chrome — not the stock neon palette).
 * Honors prefers-reduced-motion (static border when reduce is set).
 *
 * Registry install: set SKIPER_LICENSE_KEY in `.env.local`, then
 * `npx shadcn add @skiper-ui/skiper86` (re-apply sio stops after overwrite).
 */

import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

export type AppleBorderIntensity =
  | "xs"
  | "sm"
  | "md"
  | "lg"
  | "xl"
  | "2xl"
  | "3xl";

export type AppleBorderGradientProps = {
  /** When true, show the border gradient. */
  preview?: boolean;
  /** Blur intensity of the inward mask (quieter = sm). */
  intensity?: AppleBorderIntensity;
  className?: string;
};

/** Quiet rotating stops — pending blue + retention amber + neutral borders. */
const SIO_BORDER_GRADIENT = [
  "linear-gradient(0deg, color-mix(in oklch, var(--sio-status-pending-accent) 50%, transparent), color-mix(in oklch, var(--sio-signal-retention-accent) 40%, transparent), color-mix(in oklch, var(--sio-border-strong) 65%, transparent), color-mix(in oklch, var(--sio-fg-subtle) 30%, transparent))",
  "linear-gradient(360deg, color-mix(in oklch, var(--sio-status-pending-accent) 50%, transparent), color-mix(in oklch, var(--sio-signal-retention-accent) 40%, transparent), color-mix(in oklch, var(--sio-border-strong) 65%, transparent), color-mix(in oklch, var(--sio-fg-subtle) 30%, transparent))",
] as const;

const INTENSITY_BLUR: Record<AppleBorderIntensity, string> = {
  xs: "after:blur-[2px]",
  sm: "after:blur-sm",
  md: "after:blur-md",
  lg: "after:blur-lg",
  xl: "after:blur-xl",
  "2xl": "after:blur-2xl",
  "3xl": "after:blur-3xl",
};

/**
 * Absolute overlay — parent must be `relative` (+ usually `overflow-hidden`).
 * Content siblings need a higher z-index so they sit above the glow.
 */
export function AppleBorderGradient({
  preview = false,
  intensity = "lg",
  className,
}: AppleBorderGradientProps) {
  const reduceMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {preview ? (
        <motion.div
          aria-hidden
          initial={{ opacity: 0 }}
          exit={{ opacity: 0 }}
          animate={
            reduceMotion
              ? { opacity: 1, background: SIO_BORDER_GRADIENT[0] }
              : { opacity: 1, background: [...SIO_BORDER_GRADIENT] }
          }
          transition={
            reduceMotion
              ? { opacity: { duration: 0.2, ease: "easeInOut" } }
              : {
                  opacity: { duration: 0.5, ease: "easeInOut" },
                  duration: 5,
                  repeat: Infinity,
                  ease: "linear",
                }
          }
          className={cn(
            "pointer-events-none absolute inset-0 size-full after:absolute after:inset-[2px] after:bg-sio-bg-base after:content-['']",
            INTENSITY_BLUR[intensity],
            className,
          )}
        />
      ) : null}
    </AnimatePresence>
  );
}
