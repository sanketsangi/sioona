/** Cross-component notice when SignalScore feedback is saved (Insights review). */

export const FEEDBACK_SAVED_EVENT = "sioona:feedback-saved";

export type FeedbackSavedDetail = { signalId: string };

/** Survives client remounts until the server signal carries feedback. */
const recentFeedbackIds = new Set<string>();

export function emitFeedbackSaved(signalId: string): void {
  recentFeedbackIds.add(signalId);
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<FeedbackSavedDetail>(FEEDBACK_SAVED_EVENT, {
      detail: { signalId },
    }),
  );
}

export function hasRecentFeedbackSaved(signalId: string): boolean {
  return recentFeedbackIds.has(signalId);
}

export function clearRecentFeedbackSaved(signalId: string): void {
  recentFeedbackIds.delete(signalId);
}
