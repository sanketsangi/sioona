"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { QUEUE_REVIEW_ACTION_CLASS } from "@/components/SignalQueueRow";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Signal } from "@/lib/types";
import { useMarkActed } from "@/lib/use-mark-acted";

const ACTED_TOOLTIP = "Does not send the suggested action.";

/**
 * Insights Follow-up list Action — Mark as Acted without opening preview.
 * Stay on the list (no preview walk); same Neon POST as the rail.
 */
export function QueueMarkActedAction({
  signal,
  summaryForLabel,
}: {
  signal: Signal;
  summaryForLabel: string;
}) {
  const { actedPending, canMarkActed, error, setActed } = useMarkActed(signal);

  if (!canMarkActed) return null;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-w-0 flex-col items-start gap-1">
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex shrink-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className={QUEUE_REVIEW_ACTION_CLASS}
                disabled={actedPending}
                aria-busy={actedPending}
                aria-label={`Mark as Acted for ${summaryForLabel}`}
                onClick={() => void setActed(true)}
              >
                {actedPending ? (
                  <ButtonSpinner />
                ) : (
                  <Check
                    className="size-3.5 shrink-0"
                    weight="bold"
                    aria-hidden
                  />
                )}
                Mark as Acted
              </Button>
            </span>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="start">
            {ACTED_TOOLTIP}
          </TooltipContent>
        </Tooltip>
        {error ? (
          <p
            className="max-w-[12rem] text-pretty text-label-12 text-sio-status-danger-fg"
            role="alert"
          >
            {error}
          </p>
        ) : null}
      </div>
    </TooltipProvider>
  );
}
