"use client";

import { Check } from "@phosphor-icons/react/ssr";
import { useRef, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import { queueActionLabelForKind } from "@/components/RetentionEmailAction";
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

const ACTED_TOOLTIP =
  "You run this in your tools — Sioona never sends or CRM-tags.";

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
  const { actedPending: pending, canMarkActed, error, setActed } =
    useMarkActed(signal);
  /** Sync guard — pending state updates too late to stop a second POST. */
  const inflightRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const label = queueActionLabelForKind("mark_acted", "list");

  async function onMarkActed() {
    if (inflightRef.current || submitting || pending) return;
    inflightRef.current = true;
    setSubmitting(true);
    try {
      await setActed(true);
    } finally {
      inflightRef.current = false;
      setSubmitting(false);
    }
  }

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
                disabled={submitting || pending}
                aria-busy={submitting || pending}
                aria-label={`${label} for ${summaryForLabel}`}
                onClick={() => void onMarkActed()}
              >
                {submitting || pending ? (
                  <ButtonSpinner />
                ) : (
                  <Check
                    className="size-3.5 shrink-0"
                    weight="bold"
                    aria-hidden
                  />
                )}
                {label}
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
