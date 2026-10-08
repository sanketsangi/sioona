import { evidenceQuotesForDisplay } from "./server-evidence";
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
    if (
      !matched.evidenceQuote.trim() &&
      evidenceQuotesForDisplay(signal).length > 0
    ) {
      const filled = createSupervisedDraftAction({
        signal,
        customerName,
        evidence: evidenceQuotesForDisplay(signal),
        id: matched.id,
        createdAt: matched.createdAt,
      });
      if (filled?.evidenceQuote) {
        return { ...matched, evidenceQuote: filled.evidenceQuote };
      }
    }
    return matched;
  }
  const evidence = evidenceQuotesForDisplay(signal);
  return createSupervisedDraftAction({
    signal,
    customerName,
    evidence,
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
 * stored draft decision → that decision;
 * pending high-confidence retention email (`retention_email_draft`,
 * same band as `shouldGenerateRetentionEmail`) → Approve;
 * every other signal that still needs a look → Review.
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
  const draft = resolveRetentionEmailAction(signal, customerName, stored);
  if (draft?.type === "retention_email_draft" && draft.status === "pending") {
    return "approve";
  }
  return "review";
}
