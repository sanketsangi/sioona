import type { FeedbackLabel } from "./types";
import {
  nextPendingPreviewId,
  type SignalReviewTriage,
  type WorkspaceMode,
} from "./views";

/** Build triage context for an open `?preview=` panel. */
export function buildSignalReviewTriage(opts: {
  pendingSignals: { id: string }[];
  previewSignal: { id: string };
  scoreFrom?: string | null;
  mode?: WorkspaceMode;
}): SignalReviewTriage {
  const isPendingReview = opts.pendingSignals.some(
    (pending) => pending.id === opts.previewSignal.id,
  );
  return {
    isPendingReview,
    nextPendingPreviewId: nextPendingPreviewId(
      opts.pendingSignals,
      opts.previewSignal.id,
    ),
    scoreFrom: opts.scoreFrom,
    mode: opts.mode,
  };
}

export const FEEDBACK_SHORTCUT_BY_KEY: Record<string, FeedbackLabel> = {
  c: "correct",
  i: "incorrect",
  p: "partially_correct",
};

export function feedbackLabelForShortcutKey(key: string): FeedbackLabel | null {
  return FEEDBACK_SHORTCUT_BY_KEY[key.toLowerCase()] ?? null;
}

/** Skip review shortcuts while typing in form controls. */
export function isEditableShortcutTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string; isContentEditable?: boolean };
  const tag = el.tagName?.toUpperCase();
  if (!tag) return false;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    Boolean(el.isContentEditable)
  );
}
