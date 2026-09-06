"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import {
  clearRecentFeedbackSaved,
  FEEDBACK_SAVED_EVENT,
  hasRecentFeedbackSaved,
  type FeedbackSavedDetail,
} from "@/lib/feedback-saved";
import { postSignalActed } from "@/lib/signal-acted-client";
import type { FeedbackLabel, Signal } from "@/lib/types";
import {
  afterMarkActedHref,
  type ActionFilter,
  type StatusFilter,
  type TypeFilter,
  type WorkspaceMode,
} from "@/lib/views";

export type MarkActedWalk = {
  /** Next Correct-not-Acted after this panel (Follow-up Act queue). */
  nextPreviewId?: string | null;
  /** Next needs-review id after this panel (or first pending from Follow-up). */
  nextPendingPreviewId?: string | null;
  /** Current Insights status filter — kept for callers; not used to land on empty lists. */
  statusFilter?: StatusFilter;
  /** Preserve type filter on Mark Acted advances. */
  typeFilter?: TypeFilter;
  /** Preserve Approve / Review CTA filter on Mark Acted advances. */
  actionFilter?: ActionFilter;
  scoreFrom?: string | null;
  /** Preserve Action Mode on next Follow-up deep links. */
  mode?: WorkspaceMode;
  /** Replace-ingest landing — keep leftover Neon overlay off. */
  replaced?: boolean;
  /** Preserve Vault `?file=` scope on Mark Acted advances. */
  file?: string | null;
};

/** Correct-before-Acted — Incorrect / Partial never unlock Mark as Acted. */
export function resolveCanMarkActed(opts: {
  hasFeedback: boolean;
  feedbackLabel: FeedbackLabel | null | undefined;
  isActed: boolean;
}): boolean {
  return (
    opts.hasFeedback &&
    opts.feedbackLabel === "correct" &&
    !opts.isActed
  );
}

/**
 * Shared Mark Acted / undo for Insights header + Suggested Next Action rail.
 * Optimistic feedback gate matches header (FEEDBACK_SAVED_EVENT).
 */
export function useMarkActed(signal: Signal, walk: MarkActedWalk = {}) {
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
  const resolvedLabel = feedbackLabel ?? (feedbackLocal ? "correct" : null);
  const canMarkActed = resolveCanMarkActed({
    hasFeedback,
    feedbackLabel: resolvedLabel,
    isActed,
  });

  const setActed = useCallback(
    async (acted: boolean) => {
      setActedPending(true);
      setError(null);
      try {
        await postSignalActed(signal, acted);
        const href = afterMarkActedHref({
          acted,
          feedbackLabel: resolvedLabel,
          nextPreviewId: walk.nextPreviewId,
          nextPendingPreviewId: walk.nextPendingPreviewId,
          statusFilter: walk.statusFilter,
          typeFilter: walk.typeFilter,
          actionFilter: walk.actionFilter,
          scoreFrom: walk.scoreFrom,
          mode: walk.mode,
          replaced: walk.replaced,
          file: walk.file,
        });
        if (href) {
          router.push(href, { scroll: false });
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
    },
    [
      resolvedLabel,
      router,
      signal,
      walk.actionFilter,
      walk.file,
      walk.mode,
      walk.nextPendingPreviewId,
      walk.nextPreviewId,
      walk.replaced,
      walk.scoreFrom,
      walk.statusFilter,
      walk.typeFilter,
    ],
  );

  return {
    actedPending,
    canMarkActed,
    error,
    hasFeedback,
    isActed,
    resolvedLabel,
    setActed,
  };
}
