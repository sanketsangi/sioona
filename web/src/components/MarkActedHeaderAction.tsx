"use client";

import { ArrowCounterClockwise } from "@phosphor-icons/react/ssr";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Signal } from "@/lib/types";
import {
  useMarkActed,
  type MarkActedWalk,
} from "@/lib/use-mark-acted";

const ACTED_TOOLTIP =
  "You run this in your tools — Sioona never sends or CRM-tags.";

/**
 * Insights review header — Mark as Pending undo after Acted.
 * Suggested Next Action owns the Mark as Acted primary (Correct ¬acted).
 */
export function MarkActedHeaderAction({
  signal,
  ...walk
}: {
  signal: Signal;
} & MarkActedWalk) {
  const { actedPending, canMarkActed, error, hasFeedback, isActed, setActed } =
    useMarkActed(signal, walk);

  // Rail owns Mark as Acted; header only undoes Acted → Pending.
  if (!hasFeedback || canMarkActed || !isActed) return null;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="sr-only" aria-live="polite">
          Marked as Acted — run it in your tools; Sioona never sends or
          CRM-tags.
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <button
                type="button"
                className="btn-secondary shrink-0"
                disabled={actedPending}
                aria-busy={actedPending}
                onClick={() => void setActed(false)}
              >
                {actedPending ? (
                  <ButtonSpinner />
                ) : (
                  <ArrowCounterClockwise
                    className="size-3.5 shrink-0"
                    weight="bold"
                    aria-hidden
                  />
                )}
                Mark as Pending
              </button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center">
            {ACTED_TOOLTIP}
          </TooltipContent>
        </Tooltip>
        {error ? (
          <p
            className="w-full text-label-12 text-sio-status-danger-fg min-[540px]:w-auto"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
