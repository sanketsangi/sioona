"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Signal } from "@/lib/types";

const ACTED_TOOLTIP = "Does not send the suggested action.";

/**
 * Insights review header — single toggle beside Open Conversation.
 * Mark as Acted ↔ Mark as Pending (undo keeps feedback; status → reviewed).
 * Only when the signal already has SignalScore feedback (Shadow Mode).
 */
export function MarkActedHeaderAction({ signal }: { signal: Signal }) {
  const router = useRouter();
  const [actedPending, setActedPending] = useState(false);
  const [actedLocal, setActedLocal] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasFeedback = Boolean(signal.feedback);
  const isActed = actedLocal ?? signal.status === "acted";

  if (!hasFeedback) return null;

  async function setActed(acted: boolean) {
    setActedPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals/${signal.id}/acted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acted }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to update acted status");
      }
      setActedLocal(acted);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to update acted status",
      );
    } finally {
      setActedPending(false);
    }
  }

  const label = isActed ? "Mark as Pending" : "Mark as Acted";

  return (
    <TooltipProvider delayDuration={0}>
      <div className="flex flex-wrap items-center gap-2">
        <p className="sr-only" aria-live="polite">
          {isActed
            ? "Marked as Acted. Suggested action was not sent."
            : null}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="btn-secondary"
              disabled={actedPending}
              aria-busy={actedPending}
              onClick={() => void setActed(!isActed)}
            >
              {actedPending ? <ButtonSpinner /> : null}
              {label}
            </button>
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
