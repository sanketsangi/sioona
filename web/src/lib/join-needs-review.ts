/**
 * Join Neon needs-review predictions to JSON store signals for Shadow Mode cards.
 * Order follows the backend queue (newest-first).
 */

import type { BackendPrediction } from "./backend-client";
import type { Signal, SignalType } from "./types";

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
 * Prefers JSON match (evidence/detail); falls back to a Neon stub.
 */
export function joinNeedsReviewPredictions(
  predictions: BackendPrediction[],
  jsonSignals: Signal[]
): Signal[] {
  return predictions.map((prediction) => {
    const matched = findJsonSignal(prediction, jsonSignals);
    if (!matched) {
      return predictionToStubSignal(prediction);
    }
    return {
      ...matched,
      backendSignalId: matched.backendSignalId ?? prediction.id,
      // Pending queue SoT is Neon — treat as unreviewed for UI status
      status: "new" as const,
      feedback: undefined,
    };
  });
}

/** JSON signals that already have human feedback (reviewed filter). */
export function reviewedSignalsFromStore(jsonSignals: Signal[]): Signal[] {
  return jsonSignals.filter((s) => Boolean(s.feedback));
}
