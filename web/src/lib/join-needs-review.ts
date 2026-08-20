/**
 * Join Neon needs-review predictions to JSON store signals for Shadow Mode cards.
 * Order follows the backend queue (newest-first).
 */

import type {
  BackendPrediction,
  BackendPredictionWithFeedback,
} from "./backend-client";
import type { FeedbackLabel, Signal, SignalType } from "./types";

const KNOWN_TYPES = new Set<string>(["lead", "retention", "upsell"]);

function asSignalType(raw: string): SignalType {
  if (KNOWN_TYPES.has(raw)) return raw as SignalType;
  return "lead";
}

/** Minimal card when Neon has a prediction the JSON store has not mirrored yet. */
export function predictionToStubSignal(prediction: BackendPrediction): Signal {
  return {
    id: `sig_neon_${prediction.id}`,
    tenantId: prediction.tenant_id,
    conversationId: prediction.conversation_id,
    type: asSignalType(prediction.signal_type),
    score: prediction.confidence,
    confidence: prediction.confidence,
    summary: prediction.summary,
    suggestedAction: "",
    evidence: [],
    status: "new",
    createdAt: prediction.created_at,
    backendSignalId: prediction.id,
  };
}

function findJsonSignal(
  prediction: BackendPrediction,
  signals: Signal[]
): Signal | undefined {
  const byId = signals.find((s) => s.backendSignalId === prediction.id);
  if (byId) return byId;

  return signals.find(
    (s) =>
      s.conversationId === prediction.conversation_id &&
      s.type === prediction.signal_type
  );
}

/**
 * Map each needs-review prediction to a display Signal, preserving Neon order.
 * Prefers JSON match (evidence / local conversation). Unmatched Neon rows
 * (stale Partner Demo runs with different conversation ids) are omitted so
 * Insights never opens a card with no local chat.
 * Dedupes by JSON signal id when multiple Neon rows match the same local
 * signal (re-detect / dual-write races) so queue React keys stay unique.
 */
export function joinNeedsReviewPredictions(
  predictions: BackendPrediction[],
  jsonSignals: Signal[]
): Signal[] {
  const seenJsonIds = new Set<string>();
  const joined: Signal[] = [];

  for (const prediction of predictions) {
    const matched = findJsonSignal(prediction, jsonSignals);
    if (!matched) {
      continue;
    }
    if (seenJsonIds.has(matched.id)) {
      continue;
    }
    // JSON already has operator feedback — leave Neon pending SoT, but do not
    // re-show as Needs Review (would strip feedback and stick StatusDot on blue).
    if (matched.feedback) {
      continue;
    }
    seenJsonIds.add(matched.id);
    joined.push({
      ...matched,
      backendSignalId: matched.backendSignalId ?? prediction.id,
      // Pending queue SoT is Neon — treat as unreviewed for UI status
      status: "new" as const,
      feedback: undefined,
    });
  }

  return joined;
}

/** JSON signals that already have human feedback (reviewed filter). */
export function reviewedSignalsFromStore(jsonSignals: Signal[]): Signal[] {
  return jsonSignals.filter((s) => Boolean(s.feedback));
}

function asFeedbackLabel(raw: string): FeedbackLabel | null {
  if (
    raw === "correct" ||
    raw === "incorrect" ||
    raw === "partially_correct"
  ) {
    return raw as FeedbackLabel;
  }
  return null;
}

/**
 * Insights Done tree: Neon tenant signals that already have feedback, joined
 * to JSON keep-set chats. Leftover Groww (or other pack) Neon reviews with no
 * local conversation are omitted — same join rule as Follow-up / needs-review.
 */
export function doneQueueSignals(
  rows: BackendPredictionWithFeedback[],
  jsonSignals: Signal[]
): Signal[] {
  const seenJsonIds = new Set<string>();
  const joined: Signal[] = [];

  for (const row of rows) {
    if (!row.feedback) continue;
    const label = asFeedbackLabel(row.feedback.feedback);
    if (!label) continue;
    const matched = findJsonSignal(row, jsonSignals);
    if (!matched) continue;
    if (seenJsonIds.has(matched.id)) continue;
    seenJsonIds.add(matched.id);
    const note = row.feedback.note?.trim();
    joined.push({
      ...matched,
      backendSignalId: matched.backendSignalId ?? row.id,
      status: row.acted ? "acted" : "reviewed",
      feedback: {
        label,
        ...(note ? { note } : {}),
        reviewedAt: row.feedback.reviewed_at,
      },
    });
  }

  return joined;
}

/**
 * Shadow Mode pending list for Insights: Neon needs-review join first, then
 * keep-set JSON unreviewed rows Neon did not return (id drift / stale queue).
 * Reviewed (feedback) rows stay out — they belong in the reviewed filter.
 */
export function pendingQueueSignals(
  predictions: BackendPrediction[],
  jsonSignals: Signal[]
): Signal[] {
  const fromNeon = joinNeedsReviewPredictions(predictions, jsonSignals);
  const seen = new Set(fromNeon.map((s) => s.id));
  const localOnly: Signal[] = [];
  for (const signal of jsonSignals) {
    if (signal.feedback) continue;
    if (seen.has(signal.id)) continue;
    seen.add(signal.id);
    localOnly.push(signal);
  }
  return [...fromNeon, ...localOnly];
}
