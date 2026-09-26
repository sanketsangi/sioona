import {
  createSupervisedDraftAction,
  supervisedActionTypeForSignal,
} from "./supervised-actions";
import type {
  Signal,
  SupervisedAction,
  SupervisedActionDecision,
} from "./types";

/**
 * Display draft for the queue row. Stored draft wins when it matches the
 * live kind; otherwise a pending draft is composed. Nothing is sent.
 */
export function resolveRetentionEmailAction(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
): SupervisedAction | null {
  const expected = supervisedActionTypeForSignal(signal);
  if (!expected) return null;
  const matched = stored && stored.type === expected ? stored : null;
  if (matched) {
    // Neon stubs may have locked an empty quote before chat evidence joined.
    // Prefer live signal evidence for display without rewriting decided drafts.
    if (!matched.evidenceQuote.trim() && signal.evidence.length > 0) {
      const filled = createSupervisedDraftAction({
        signal,
        customerName,
        evidence: signal.evidence,
        id: matched.id,
        createdAt: matched.createdAt,
      });
      if (filled?.evidenceQuote) {
        return { ...matched, evidenceQuote: filled.evidenceQuote };
      }
    }
    return matched;
  }
  return createSupervisedDraftAction({
    signal,
    customerName,
    evidence: signal.evidence,
  });
}

/** Insights list Action column — cadence-aware, not outbound. */
export type QueueActionKind =
  | "mark_acted"
  | "acted"
  | "view"
  | "approve"
  | "review"
  | SupervisedActionDecision;

/**
 * Queue Action kind by signal state.
 * Follow-up Correct ¬acted → mark_acted; Done → acted;
 * stored draft decision → that decision; pending supervised draft → Approve;
 * else Review.
 */
export function queueActionKindForSignal(
  signal: Signal,
  customerName: string,
  stored?: SupervisedAction | null,
): QueueActionKind {
  if (signal.status === "acted") return "acted";
  if (signal.feedback?.label === "correct") return "mark_acted";
  const decision = stored?.status;
  if (
    decision === "approved" ||
    decision === "edited" ||
    decision === "dismissed"
  ) {
    return decision;
  }
  return resolveRetentionEmailAction(signal, customerName, stored)
    ? "approve"
    : "review";
}
