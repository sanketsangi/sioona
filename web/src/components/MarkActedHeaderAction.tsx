"use client";

import { ArrowCounterClockwise, Check } from "@phosphor-icons/react/ssr";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ButtonSpinner } from "@/components/ButtonSpinner";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  clearRecentFeedbackSaved,
  FEEDBACK_SAVED_EVENT,
  hasRecentFeedbackSaved,
  type FeedbackSavedDetail,
} from "@/lib/feedback-saved";
import type { Signal } from "@/lib/types";
import {
  afterMarkActedHref,
  type StatusFilter,
  type WorkspaceMode,
} from "@/lib/views";

const ACTED_TOOLTIP = "Does not send the suggested action.";

/**
 * Insights review header — single toggle beside Open Conversation.
 * Mark as Acted ↔ Mark as Pending (undo keeps feedback; status → reviewed).
 * Stays available after feedback responds (optimistic + remount-safe).
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
  /** Next Correct-not-Acted after this panel (Follow-up Act queue). */
  nextPreviewId?: string | null;
  /** Next needs-review id after this panel (Pending return path). */
  nextPendingPreviewId?: string | null;
  /** Current Insights status filter — Follow-up vs Pending return. */
  statusFilter?: StatusFilter;
  scoreFrom?: string | null;
  /** Preserve Action Mode on next Follow-up deep links. */
  mode?: WorkspaceMode;
}) {
  const router = useRouter();
  const [actedPending, setActedPending] = useState(false);
  const [actedLocal, setActedLocal] = useState<boolean | null>(null);
  const [feedbackLocal, setFeedbackLocal] = useState(() =>
    hasRecentFeedbackSaved(signal.id),
  );
  const [error, setError] = useState<string | null>(null);

  const feedbackLabel = signal.feedback?.label;
  useEffect(() => {
    if (feedbackLabel) {
      clearRecentFeedbackSaved(signal.id);
    }
  }, [feedbackLabel, signal.id]);

  useEffect(() => {
    function onFeedbackSaved(event: Event) {
      const detail = (event as CustomEvent<FeedbackSavedDetail>).detail;
      if (detail?.signalId === signal.id) setFeedbackLocal(true);
    }
    window.addEventListener(FEEDBACK_SAVED_EVENT, onFeedbackSaved);
    return () =>
      window.removeEventListener(FEEDBACK_SAVED_EVENT, onFeedbackSaved);
  }, [signal.id]);

  const hasFeedback = Boolean(signal.feedback) || feedbackLocal;
  const isActed = actedLocal ?? signal.status === "acted";

  if (!hasFeedback) return null;

  async function setActed(acted: boolean) {
    setActedPending(true);
    setError(null);
    try {
      const res = await fetch(`/api/signals/${signal.id}/acted`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acted,
          // Hosted /tmp drift: API resolves by Neon UUID or conversation+type
          // when the JSON signal id from this card is missing on the instance.
          ...(signal.backendSignalId
            ? { backendSignalId: signal.backendSignalId }
            : {}),
          conversationId: signal.conversationId,
          type: signal.type,
        }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || "Failed to update acted status");
      }
      const href = afterMarkActedHref({
        acted,
        feedbackLabel: signal.feedback?.label,
        nextPreviewId,
        nextPendingPreviewId,
        statusFilter,
        scoreFrom,
        mode,
      });
      if (href) {
        router.push(href);
        return;
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
  const ActionIcon = isActed ? ArrowCounterClockwise : Check;

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <p className="sr-only" aria-live="polite">
          {isActed
            ? "Marked as Acted. Suggested action was not sent."
            : null}
        </p>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-flex">
              <button
                type="button"
                className="btn-primary"
                disabled={actedPending}
                aria-busy={actedPending}
                onClick={() => void setActed(!isActed)}
              >
                {actedPending ? (
                  <ButtonSpinner />
                ) : (
                  <ActionIcon
                    className="size-3.5 shrink-0"
                    weight="bold"
                    aria-hidden
                  />
                )}
                {label}
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
