import type { BackendSignalScore } from "./backend-client";
import type { Signal, SignalType, StoreData } from "./types";

const SIGNAL_TYPES: SignalType[] = ["lead", "retention", "upsell"];

export interface TypeEvalMetrics {
  type: SignalType;
  labeledCount: number;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  precision: number | null;
  recall: number | null;
}

export interface EvalMetrics {
  labeledConversations: number;
  predictedSignals: number;
  reviewedCount: number;
  correctCount: number;
  incorrectCount: number;
  partiallyCorrectCount: number;
  reviewPrecision: number | null;
  labeledPrecision: number | null;
  labeledRecall: number | null;
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  byType: TypeEvalMetrics[];
  /** True when reviewPrecision came from FastAPI SignalScore */
  signalScoreFromBackend?: boolean;
}

function emptyTypeBuckets(): Record<
  SignalType,
  Omit<TypeEvalMetrics, "precision" | "recall">
> {
  return {
    lead: {
      type: "lead",
      labeledCount: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    },
    retention: {
      type: "retention",
      labeledCount: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    },
    upsell: {
      type: "upsell",
      labeledCount: 0,
      truePositives: 0,
      falsePositives: 0,
      falseNegatives: 0,
    },
  };
}

export function computeEvalMetrics(store: StoreData): EvalMetrics {
  const labeled = store.conversations.filter((c) => c.groundTruth);
  const labeledIds = new Set(labeled.map((c) => c.id));

  const predicted = store.signals.filter((s) =>
    labeledIds.has(s.conversationId)
  );

  let truePositives = 0;
  let falsePositives = 0;
  let falseNegatives = 0;
  const byType = emptyTypeBuckets();

  for (const conversation of labeled) {
    const expected = conversation.groundTruth!;
    const preds = predicted.filter((s) => s.conversationId === conversation.id);

    if (expected !== "none") {
      byType[expected].labeledCount += 1;
    }

    if (expected === "none") {
      if (preds.length === 0) {
        // correctly predicted no signal
      } else {
        falsePositives += preds.length;
        for (const pred of preds) {
          byType[pred.type].falsePositives += 1;
        }
      }
      continue;
    }

    const hits = preds.filter((s) => s.type === expected);
    const misses = preds.filter((s) => s.type !== expected);
    if (hits.length > 0) {
      truePositives += 1;
      byType[expected].truePositives += 1;
    } else {
      falseNegatives += 1;
      byType[expected].falseNegatives += 1;
    }
    falsePositives += misses.length;
    for (const miss of misses) {
      byType[miss.type].falsePositives += 1;
    }
    // Extra duplicate correct types beyond first don't count as TP again
    if (hits.length > 1) {
      falsePositives += hits.length - 1;
      byType[expected].falsePositives += hits.length - 1;
    }
  }

  const reviewed = store.signals.filter((s) => s.feedback);
  const correct = reviewed.filter((s) => s.feedback?.label === "correct");
  const incorrect = reviewed.filter((s) => s.feedback?.label === "incorrect");
  const partiallyCorrect = reviewed.filter(
    (s) => s.feedback?.label === "partially_correct"
  );

  const labeledDenom = truePositives + falsePositives;
  const recallDenom = truePositives + falseNegatives;

  return {
    labeledConversations: labeled.length,
    predictedSignals: predicted.length,
    reviewedCount: reviewed.length,
    correctCount: correct.length,
    incorrectCount: incorrect.length,
    partiallyCorrectCount: partiallyCorrect.length,
    reviewPrecision:
      reviewed.length === 0 ? null : correct.length / reviewed.length,
    labeledPrecision:
      labeledDenom === 0 ? null : truePositives / labeledDenom,
    labeledRecall: recallDenom === 0 ? null : truePositives / recallDenom,
    truePositives,
    falsePositives,
    falseNegatives,
    byType: SIGNAL_TYPES.map((type) => {
      const row = byType[type];
      const precisionDenom = row.truePositives + row.falsePositives;
      const typeRecallDenom = row.truePositives + row.falseNegatives;
      return {
        ...row,
        precision:
          precisionDenom === 0 ? null : row.truePositives / precisionDenom,
        recall:
          typeRecallDenom === 0 ? null : row.truePositives / typeRecallDenom,
      };
    }),
  };
}

export function sortSignals(signals: Signal[]): Signal[] {
  return [...signals].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Pilot go/no-go threshold for human review precision. */
export const REVIEW_PRECISION_TARGET = 0.8;
const MIN_REVIEWS_FOR_GO_NO_GO = 5;

export type PilotGoNoGo = "go" | "hold" | "insufficient_data";

export interface PilotMetrics {
  /** Conversations where Sioona emitted ≥1 signal */
  sioonaOpportunities: number;
  /** Total detected signals in the store */
  signalCount: number;
  /** Labeled conversations with a non-none ground truth */
  labeledOpportunities: number;
  /**
   * Partner baseline opportunities (manual process).
   * Defaults to 0 until a pilot sets an agreed baseline count.
   */
  baselineOpportunities: number;
  opportunityLift: number;
  reviewPrecision: number | null;
  labeledPrecision: number | null;
  labeledRecall: number | null;
  reviewPrecisionTarget: number;
  meetsReviewPrecisionTarget: boolean | null;
  pendingReviews: number;
  reviewedCount: number;
  goNoGo: PilotGoNoGo;
  offerSummary: string;
}

export function computePilotMetrics(store: StoreData): PilotMetrics {
  const evalMetrics = computeEvalMetrics(store);
  const baselineOpportunities = Math.max(
    0,
    store.pilot?.baselineOpportunities ?? 0
  );
  const sioonaOpportunities = new Set(
    store.signals.map((s) => s.conversationId)
  ).size;
  const labeledOpportunities = store.conversations.filter(
    (c) => c.groundTruth && c.groundTruth !== "none"
  ).length;
  const pendingReviews = store.signals.filter(
    (s) => s.status === "new" || !s.feedback
  ).length;

  const meetsReviewPrecisionTarget =
    evalMetrics.reviewPrecision === null
      ? null
      : evalMetrics.reviewPrecision >= REVIEW_PRECISION_TARGET;

  let goNoGo: PilotGoNoGo = "insufficient_data";
  if (evalMetrics.reviewedCount >= MIN_REVIEWS_FOR_GO_NO_GO) {
    goNoGo =
      meetsReviewPrecisionTarget === true
        ? "go"
        : "hold";
  } else if (
    evalMetrics.labeledConversations >= 10 &&
    evalMetrics.labeledPrecision !== null &&
    evalMetrics.labeledPrecision >= REVIEW_PRECISION_TARGET
  ) {
    // Fixture / labeled-set gate before enough human reviews accumulate
    goNoGo = "go";
  } else if (evalMetrics.reviewedCount > 0 && meetsReviewPrecisionTarget === false) {
    goNoGo = "hold";
  }

  return {
    sioonaOpportunities,
    signalCount: store.signals.length,
    labeledOpportunities,
    baselineOpportunities,
    opportunityLift: sioonaOpportunities - baselineOpportunities,
    reviewPrecision: evalMetrics.reviewPrecision,
    labeledPrecision: evalMetrics.labeledPrecision,
    labeledRecall: evalMetrics.labeledRecall,
    reviewPrecisionTarget: REVIEW_PRECISION_TARGET,
    meetsReviewPrecisionTarget,
    pendingReviews,
    reviewedCount: evalMetrics.reviewedCount,
    goNoGo,
    offerSummary:
      "Insights pilot: Shadow Mode queue + SignalScore reviews. Target ≥80% review precision on partner chats before expanding seats.",
  };
}

/**
 * Overlay FastAPI SignalScore onto local eval metrics.
 * Labeled P/R stay from JSON groundTruth; review precision uses Neon.
 */
export function applyBackendSignalScore(
  metrics: EvalMetrics,
  score: BackendSignalScore | null
): EvalMetrics {
  if (!score) return metrics;
  return {
    ...metrics,
    reviewedCount: score.reviewed_count,
    correctCount: score.correct_count,
    incorrectCount: score.incorrect_count,
    partiallyCorrectCount: score.partially_correct_count,
    reviewPrecision: score.signal_score,
    signalScoreFromBackend: true,
  };
}

/** Recompute pilot go/no-go after overlaying backend SignalScore. */
export function applyBackendSignalScoreToPilot(
  store: StoreData,
  score: BackendSignalScore | null
): PilotMetrics {
  if (!score) return computePilotMetrics(store);
  const base = computePilotMetrics(store);
  const reviewPrecision = score.signal_score;
  const reviewedCount = score.reviewed_count;
  const meetsReviewPrecisionTarget =
    reviewPrecision === null
      ? null
      : reviewPrecision >= REVIEW_PRECISION_TARGET;

  let goNoGo: PilotGoNoGo = "insufficient_data";
  if (reviewedCount >= MIN_REVIEWS_FOR_GO_NO_GO) {
    goNoGo = meetsReviewPrecisionTarget === true ? "go" : "hold";
  } else if (
    base.labeledOpportunities >= 10 &&
    base.labeledPrecision !== null &&
    base.labeledPrecision >= REVIEW_PRECISION_TARGET
  ) {
    goNoGo = "go";
  } else if (reviewedCount > 0 && meetsReviewPrecisionTarget === false) {
    goNoGo = "hold";
  }

  return {
    ...base,
    reviewPrecision,
    meetsReviewPrecisionTarget,
    reviewedCount,
    goNoGo,
  };
}
