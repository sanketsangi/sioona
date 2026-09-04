import type { FeedbackLabel } from "./types";
import {
  nextPendingPreviewId,
  prevPendingPreviewId,
  type ActionFilter,
  type SignalReviewTriage,
  type TypeFilter,
  type WorkspaceMode,
} from "./views";

export type PendingWalkDirection = "prev" | "next";

/** Build triage context for an open `?preview=` panel. */
export function buildSignalReviewTriage(opts: {
  /** Full needs-review list — drives `isPendingReview` (feedback advance). */
  pendingSignals: { id: string }[];
  /**
   * Filtered walk order for Prev / Next / Skip (type + action).
   * Defaults to `pendingSignals` when omitted.
   */
  walkPendingSignals?: { id: string }[];
  previewSignal: { id: string };
  scoreFrom?: string | null;
  mode?: WorkspaceMode;
  replaced?: boolean;
  typeFilter?: TypeFilter;
  actionFilter?: ActionFilter;
  file?: string | null;
}): SignalReviewTriage {
  const walk = opts.walkPendingSignals ?? opts.pendingSignals;
  const isPendingReview = opts.pendingSignals.some(
    (pending) => pending.id === opts.previewSignal.id,
  );
  return {
    isPendingReview,
    prevPendingPreviewId: prevPendingPreviewId(walk, opts.previewSignal.id),
    nextPendingPreviewId: nextPendingPreviewId(walk, opts.previewSignal.id),
    scoreFrom: opts.scoreFrom,
    mode: opts.mode,
    replaced: opts.replaced,
    typeFilter: opts.typeFilter,
    actionFilter: opts.actionFilter,
    file: opts.file,
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

/**
 * Mark Acted keyboard on Follow-up / Correct panels.
 * A or Enter — not undo; skip when Feedback still owns Enter (pending review).
 */
export function isMarkActedShortcutKey(key: string): boolean {
  return key === "Enter" || key.toLowerCase() === "a";
}

/** Enter on a button/link activates that control — do not also Mark Acted. */
export function isActedEnterBlockedTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as { tagName?: string };
  const tag = el.tagName?.toUpperCase();
  return tag === "BUTTON" || tag === "A";
}

/** J = next pending, K = previous pending. Skip is click-only. */
export function pendingWalkShortcutForKey(
  key: string,
): PendingWalkDirection | null {
  const lower = key.toLowerCase();
  if (lower === "j") return "next";
  if (lower === "k") return "prev";
  return null;
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
