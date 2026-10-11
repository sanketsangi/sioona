"use client";

import { useEffect, useState } from "react";
import { heroScript } from "@/lib/motion";

/** Scripted Insights review flow. Each step reveals one more piece of the UI. */
export const STEP = {
  idle: 0,
  rowIn: 1,
  typing: 2,
  why: 3,
  chips: 4,
  correct: 5,
  acted: 6,
  reset: 7,
} as const;

const LAST_STEP = STEP.reset;
const FINAL_STEP = STEP.acted;

const HOLD_MS: Record<number, number> = {
  [STEP.idle]: heroScript.idle,
  [STEP.rowIn]: heroScript.rowIn,
  [STEP.why]: heroScript.why,
  [STEP.chips]: heroScript.chips,
  [STEP.correct]: heroScript.correct,
  [STEP.acted]: heroScript.acted,
  [STEP.reset]: heroScript.resetFade,
};

type Options = {
  totalChars: number;
  startAtBeginning?: boolean;
  /** Element is on screen and the user has not paused the loop. */
  running: boolean;
  /** Show the static final frame and never advance. */
  reduced: boolean;
};

export function useInsightsScript({ totalChars, running, reduced, startAtBeginning = false }: Options) {
  const [step, setStep] = useState<number>(startAtBeginning ? STEP.typing : FINAL_STEP);
  const [chars, setChars] = useState(startAtBeginning ? 0 : totalChars);

  useEffect(() => {
    if (reduced || !running) return;

    if (step === STEP.typing) {
      if (chars >= totalChars) {
        const done = window.setTimeout(() => setStep(STEP.why), 450);
        return () => window.clearTimeout(done);
      }
      const tick = window.setTimeout(() => setChars((c) => Math.min(totalChars, c + 1)), heroScript.typeCharMs);
      return () => window.clearTimeout(tick);
    }

    const hold = window.setTimeout(() => {
      if (step === LAST_STEP) {
        setChars(0);
        setStep(STEP.idle);
      } else {
        setStep(step + 1);
      }
    }, HOLD_MS[step] ?? 1000);
    return () => window.clearTimeout(hold);
  }, [step, chars, running, reduced, totalChars]);

  return reduced ? { step: FINAL_STEP as number, chars: totalChars } : { step, chars };
}
