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

const ACTED_TOOLTIP = "Does not send the suggested action.";

/**
 * Insights review header — Mark as Pending undo beside Open Conversation.
 * Suggested Next Action owns the Mark as Acted primary (Correct ¬acted).
 */
export function MarkActedHeaderAction({
  signal,
  nextPreviewId = null,
  nextPendingPreviewId = null,
  statusFilter = "all",
  scoreFrom = null,
  mode = "shadow",
}: {
  signal: Signal;
} & MarkActedWalk) {
  const walk: MarkActedWalk = {
    nextPreviewId,
    nextPendingPreviewId,
    statusFilter,
    scoreFrom,
    mode,
  };
  const { actedPending, canMarkActed, error, hasFeedback, isActed, setActed } =
    useMarkActed(signal, walk);

  // Rail owns Mark as Acted; header only undoes Acted → Pending.
  if (!hasFeedback || canMarkActed || !isActed) return null;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="sr-only" aria-live="polite">
          Marked as Acted. Suggested action was not sent.
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
