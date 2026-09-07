/** Cross-component notice when SignalScore feedback is saved (Insights review). */

import type { FeedbackLabel } from "./types";

export const FEEDBACK_SAVED_EVENT = "sioona:feedback-saved";

export type FeedbackSavedDetail = {
  signalId: string;
  label: FeedbackLabel;
};

/** Survives client remounts until the server signal carries feedback. */
const recentFeedback = new Map<string, FeedbackLabel>();

export function emitFeedbackSaved(
  signalId: string,
  label: FeedbackLabel,
): void {
  recentFeedback.set(signalId, label);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FeedbackSavedDetail>(FEEDBACK_SAVED_EVENT, {
      detail: { signalId, label },
    }),
  );
}

export function hasRecentFeedbackSaved(signalId: string): boolean {
  return recentFeedback.has(signalId);
}

/** Optimistic label for Correct-before-Acted until SSR feedback arrives. */
export function recentFeedbackLabel(
  signalId: string,
): FeedbackLabel | null {
  return recentFeedback.get(signalId) ?? null;
}

export function clearRecentFeedbackSaved(signalId: string): void {
  recentFeedback.delete(signalId);
}
