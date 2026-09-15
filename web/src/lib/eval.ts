import type { BackendSignalScore } from "./backend-client";
import { PILOT_MIN_REVIEWS } from "./pilot-cadence";
import type { FeedbackLabel, Signal, SignalType, StoreData } from "./types";

const SIGNAL_TYPES: SignalType[] = ["lead", "retention", "upsell"];

/** Canonical human review labels — same set FastAPI scores. */
const REVIEW_FEEDBACK_LABELS = new Set<FeedbackLabel>([
  "correct",
  "incorrect",
  "partially_correct",
]);

/** Queue / list rank — retention is the primary product signal. */
export const SIGNAL_TYPE_RANK: Record<SignalType, number> = {
  retention: 0,
  upsell: 1,
  lead: 2,
};

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

  const reviewed = store.signals.filter(
    (s) => s.feedback && REVIEW_FEEDBACK_LABELS.has(s.feedback.label)
  );
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
    const typeDelta = SIGNAL_TYPE_RANK[a.type] - SIGNAL_TYPE_RANK[b.type];
    if (typeDelta !== 0) return typeDelta;
    if (b.score !== a.score) return b.score - a.score;
    return b.createdAt.localeCompare(a.createdAt);
  });
}

/** Pilot go/no-go threshold for human review precision (keep-set SignalScore). */
export const REVIEW_PRECISION_TARGET = 0.8;
/** 4/5 — integer form of {@link REVIEW_PRECISION_TARGET} (avoids float drift). */
const KEEP_SET_PRECISION_NUM = 4;
const KEEP_SET_PRECISION_DEN = 5;

export type PilotGoNoGo = "go" | "hold" | "insufficient_data";

/** Counts Eval / Insights trust when a Neon score float disagrees. */
export function normalizeSignalScoreCounts(score: {
  reviewed_count: number;
  correct_count: number;
  incorrect_count: number;
  partially_correct_count: number;
  signal_score?: number | null;
}): {
  reviewedCount: number;
  correctCount: number;
  reviewPrecision: number | null;
} {
  const labeled = Math.max(
    0,
    score.correct_count +
      score.incorrect_count +
      score.partially_correct_count
  );
  const reviewedCount = Math.max(0, score.reviewed_count, labeled);
  const correctCount = Math.max(0, score.correct_count);
  return {
    reviewedCount,
    correctCount,
    reviewPrecision:
      reviewedCount <= 0 ? null : correctCount / reviewedCount,
  };
}

/** Integer-safe keep-set ≥80%: `correct / reviewed >= 4/5`. */
export function meetsKeepSetPrecisionTarget(
  reviewedCount: number,
  correctCount: number,
  reviewPrecision?: number | null,
  target = REVIEW_PRECISION_TARGET
): boolean | null {
  if (reviewedCount <= 0) return null;
  if (target === REVIEW_PRECISION_TARGET && correctCount >= 0) {
    return (
      correctCount * KEEP_SET_PRECISION_DEN >=
      reviewedCount * KEEP_SET_PRECISION_NUM
    );
  }
  const precision =
    reviewPrecision ??
    (reviewedCount > 0 ? correctCount / reviewedCount : null);
  if (precision == null) return null;
  return precision >= target;
}

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

/**
 * Keep-set SignalScore verdict from human reviews only.
 *
 * - n ≥ {@link PILOT_MIN_REVIEWS} and precision ≥ target → go
 * - n ≥ {@link PILOT_MIN_REVIEWS} and precision below target → hold
 * - optional labeled-fixture shortcut (offline JSON only)
 * - 0 < n < min with precision below target → hold
 * - otherwise → insufficient_data
 *
 * When ``correctCount`` is present, ≥80% is integer ``correct*5 >= reviewed*4``
 * so a stale ``signal_score`` float cannot flip Go/Hold.
 */
export function decidePilotGoNoGo(input: {
  reviewedCount: number;
  reviewPrecision: number | null;
  /** When set, go/hold uses counts (integer ≥4/5), not a stale float. */
  correctCount?: number;
  /** Offline JSON only: labeled P/R ≥ target with ≥10 labeled chats. */
  allowLabeledFixtureGo?: boolean;
  labeledConversations?: number;
  labeledPrecision?: number | null;
  minReviews?: number;
  precisionTarget?: number;
}): PilotGoNoGo {
  const minReviews = input.minReviews ?? PILOT_MIN_REVIEWS;
  const precisionTarget = input.precisionTarget ?? REVIEW_PRECISION_TARGET;
  const meetsTarget =
    input.correctCount != null
      ? meetsKeepSetPrecisionTarget(
          input.reviewedCount,
          input.correctCount,
          input.reviewPrecision,
          precisionTarget
        )
      : input.reviewPrecision === null
        ? null
        : input.reviewPrecision >= precisionTarget;

  if (input.reviewedCount >= minReviews) {
    return meetsTarget === true ? "go" : "hold";
  }
  if (
    input.allowLabeledFixtureGo &&
    (input.labeledConversations ?? 0) >= 10 &&
    input.labeledPrecision != null &&
    input.labeledPrecision >= precisionTarget
  ) {
    return "go";
  }
  if (input.reviewedCount > 0 && meetsTarget === false) {
    return "hold";
  }
  return "insufficient_data";
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

  const meetsReviewPrecisionTarget = meetsKeepSetPrecisionTarget(
    evalMetrics.reviewedCount,
    evalMetrics.correctCount,
    evalMetrics.reviewPrecision
  );

  const goNoGo = decidePilotGoNoGo({
    reviewedCount: evalMetrics.reviewedCount,
    reviewPrecision: evalMetrics.reviewPrecision,
    correctCount: evalMetrics.correctCount,
    allowLabeledFixtureGo: true,
    labeledConversations: evalMetrics.labeledConversations,
    labeledPrecision: evalMetrics.labeledPrecision,
  });

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
  const normalized = normalizeSignalScoreCounts(score);
  return {
    ...metrics,
    reviewedCount: normalized.reviewedCount,
    correctCount: normalized.correctCount,
    incorrectCount: score.incorrect_count,
    partiallyCorrectCount: score.partially_correct_count,
    reviewPrecision: normalized.reviewPrecision,
    signalScoreFromBackend: true,
  };
}

/**
 * Recompute pilot go/no-go after overlaying backend SignalScore.
 *
 * When Neon score is present (including empty review window), go/no-go uses
 * that window ∩ keep-set only — never the labeled-fixture shortcut, so week-2
 * empty windows stay Insufficient Data instead of recycling week-1 Go.
 * Offline / missing score is also Insufficient Data (never a labeled Go).
 */
export function applyBackendSignalScoreToPilot(
  store: StoreData,
  score: BackendSignalScore | null
): PilotMetrics {
  if (!score) {
    const base = computePilotMetrics(store);
    return {
      ...base,
      goNoGo: "insufficient_data",
      meetsReviewPrecisionTarget: null,
    };
  }
  const base = computePilotMetrics(store);
  const normalized = normalizeSignalScoreCounts(score);
  const reviewPrecision = normalized.reviewPrecision;
  const reviewedCount = normalized.reviewedCount;
  const meetsReviewPrecisionTarget = meetsKeepSetPrecisionTarget(
    reviewedCount,
    normalized.correctCount,
    reviewPrecision
  );

  return {
    ...base,
    reviewPrecision,
    meetsReviewPrecisionTarget,
    reviewedCount,
    // Neon window ∩ keep-set only — never the labeled-fixture shortcut.
    goNoGo: decidePilotGoNoGo({
      reviewedCount,
      reviewPrecision,
      correctCount: normalized.correctCount,
    }),
  };
}
