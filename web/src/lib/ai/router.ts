import type { SignalType } from "../types";
import type { AttemptSink, InferenceAttempt, InferenceStage, InferenceUsage } from "./types";
import { createInferenceId } from "./attempts";

export type ModelPricing = {
  inputPerMillionUsd: number;
  cachedInputPerMillionUsd: number;
  outputPerMillionUsd: number;
  sourceUrl: string;
  verifiedDate: string;
};

/**
 * Verified model pricing rates on 2026-10-14.
 * Source: https://groq.com/pricing
 */
export const MODEL_PRICING_TABLE: Record<string, ModelPricing> = {
  "qwen/qwen3.8-27b": {
    inputPerMillionUsd: 0.20,
    cachedInputPerMillionUsd: 0.10,
    outputPerMillionUsd: 0.40,
    sourceUrl: "https://groq.com/pricing",
    verifiedDate: "2026-10-14",
  },
  "openai/gpt-oss-20b": {
    inputPerMillionUsd: 0.15,
    cachedInputPerMillionUsd: 0.075,
    outputPerMillionUsd: 0.30,
    sourceUrl: "https://groq.com/pricing",
    verifiedDate: "2026-10-14",
  },
  "deepseek/deepseek-r1-distill-qwen-14b": {
    inputPerMillionUsd: 0.10,
    cachedInputPerMillionUsd: 0.05,
    outputPerMillionUsd: 0.20,
    sourceUrl: "https://groq.com/pricing",
    verifiedDate: "2026-10-14",
  },
  "meta/llama-3.3-70b-versatile": {
    inputPerMillionUsd: 0.59,
    cachedInputPerMillionUsd: 0.30,
    outputPerMillionUsd: 0.79,
    sourceUrl: "https://groq.com/pricing",
    verifiedDate: "2026-10-14",
  },
};

/** Compute USD cost for an inference attempt using token counts and price table. */
export function calculateAttemptCostUsd(
  model: string,
  usage: InferenceUsage,
): number | null {
  if (
    usage.status === "unknown" ||
    usage.inputTokens === null ||
    usage.outputTokens === null ||
    !Number.isFinite(usage.inputTokens) ||
    !Number.isFinite(usage.outputTokens) ||
    usage.inputTokens < 0 ||
    usage.outputTokens < 0
  ) {
    return null;
  }
  const pricing = MODEL_PRICING_TABLE[model];
  if (!pricing) return null;
  const rawCached =
    typeof usage.cachedInputTokens === "number" && Number.isFinite(usage.cachedInputTokens)
      ? Math.max(0, usage.cachedInputTokens)
      : 0;
  const cached = Math.min(usage.inputTokens, rawCached);
  const nonCached = Math.max(0, usage.inputTokens - cached);
  const inputCost = (nonCached * pricing.inputPerMillionUsd) / 1_000_000;
  const cachedCost = (cached * pricing.cachedInputPerMillionUsd) / 1_000_000;
  const outputCost = (usage.outputTokens * pricing.outputPerMillionUsd) / 1_000_000;
  return inputCost + cachedCost + outputCost;
}

export type ScreenStageRule = {
  enabled: boolean;
  minCharacterCount: number;
  requireCustomerTurn: boolean;
};

export type EscalationRule = {
  minConfidenceForEscalation: number; // e.g. 0.55
  maxConfidenceForEscalation: number; // e.g. 0.85
  escalateSignalTypes: SignalType[]; // e.g. ["retention", "lead"]
  escalateMultiTurnQuotes: boolean;
};

export type StagedRouteDefinition = {
  routeName: string;
  routeVersion: string;
  screenStage: {
    mode: "heuristic" | "model" | "pass_through";
    rules: ScreenStageRule;
    screenModel?: string;
  };
  detectStage: {
    primaryModel: string;
    fallbackModel: string;
    minConfidence: number;
  };
  verifyStage: {
    enabled: boolean;
    verifierModel: string;
    escalationRules: EscalationRule;
  };
};

export const ROUTE_BASELINE_QWEN: StagedRouteDefinition = {
  routeName: "qwen_baseline",
  routeVersion: "route:baseline:qwen3.8-27b|gpt-oss-20b",
  screenStage: {
    mode: "pass_through",
    rules: { enabled: false, minCharacterCount: 0, requireCustomerTurn: true },
  },
  detectStage: {
    primaryModel: "qwen/qwen3.8-27b",
    fallbackModel: "openai/gpt-oss-20b",
    minConfidence: 0.60,
  },
  verifyStage: {
    enabled: false,
    verifierModel: "openai/gpt-oss-20b",
    escalationRules: {
      minConfidenceForEscalation: 0.55,
      maxConfidenceForEscalation: 0.85,
      escalateSignalTypes: [],
      escalateMultiTurnQuotes: false,
    },
  },
};

export const ROUTE_CANDIDATE_STAGED: StagedRouteDefinition = {
  routeName: "staged_screen_verify",
  routeVersion: "route:staged:v1:rules_screen->detect:qwen3.8-27b->verify:gpt-oss-20b",
  screenStage: {
    mode: "heuristic",
    rules: { enabled: true, minCharacterCount: 15, requireCustomerTurn: true },
  },
  detectStage: {
    primaryModel: "qwen/qwen3.8-27b",
    fallbackModel: "openai/gpt-oss-20b",
    minConfidence: 0.60,
  },
  verifyStage: {
    enabled: true,
    verifierModel: "openai/gpt-oss-20b",
    escalationRules: {
      minConfidenceForEscalation: 0.55,
      maxConfidenceForEscalation: 0.82,
      escalateSignalTypes: ["retention"],
      escalateMultiTurnQuotes: true,
    },
  },
};

export type ScreenDecision = {
  screenedOut: boolean;
  reason?: string;
};

export function evaluateScreenStage(
  input: { conversationId: string; customerMessages: string[] },
  rules: ScreenStageRule,
): ScreenDecision {
  if (!rules.enabled) return { screenedOut: false };
  const rawMessages = Array.isArray(input?.customerMessages) ? input.customerMessages : [];
  const trimmedMessages = rawMessages
    .filter((m): m is string => typeof m === "string")
    .map((m) => m.trim())
    .filter((m) => m.length > 0);
  if (rules.requireCustomerTurn && trimmedMessages.length === 0) {
    return { screenedOut: true, reason: "missing_customer_turn" };
  }
  const totalLength = trimmedMessages.reduce((sum, msg) => sum + msg.length, 0);
  if (totalLength < rules.minCharacterCount) {
    return { screenedOut: true, reason: "below_min_characters" };
  }
  return { screenedOut: false };
}

export type VerifyEscalationDecision = {
  shouldEscalate: boolean;
  reason?: "borderline_confidence" | "high_value_signal" | "ambiguous_quotes" | "primary_fallback";
};

export function evaluateVerifyEscalation(
  classification: { type: SignalType | null; confidence: number; quotes: string[] },
  rules: EscalationRule,
  fallbackTriggered: boolean = false,
): VerifyEscalationDecision {
  if (fallbackTriggered) {
    return { shouldEscalate: true, reason: "primary_fallback" };
  }
  if (!classification?.type) {
    return { shouldEscalate: false };
  }
  if (
    Number.isFinite(classification.confidence) &&
    classification.confidence >= rules.minConfidenceForEscalation &&
    classification.confidence < rules.maxConfidenceForEscalation
  ) {
    return { shouldEscalate: true, reason: "borderline_confidence" };
  }
  const escalateSignalTypes = Array.isArray(rules?.escalateSignalTypes) ? rules.escalateSignalTypes : [];
  if (escalateSignalTypes.includes(classification.type)) {
    return { shouldEscalate: true, reason: "high_value_signal" };
  }
  if (rules.escalateMultiTurnQuotes && (classification.quotes?.length ?? 0) > 1) {
    return { shouldEscalate: true, reason: "ambiguous_quotes" };
  }
  return { shouldEscalate: false };
}

export type ClassificationOutput = {
  type: SignalType | null;
  confidence: number;
  summary: string;
  quotes: string[];
};

export type StagedExecutionResult = {
  classification: ClassificationOutput;
  stagesExecuted: InferenceStage[];
  routeVersion: string;
  modelUsed: string;
  attempts: InferenceAttempt[];
  screenedOut: boolean;
  totalCostUsd: number | null;
};

export interface StageInvoker {
  callModel: (
    stage: InferenceStage,
    model: string,
    prompt: string,
  ) => Promise<{
    output: ClassificationOutput;
    usage: InferenceUsage;
    latencyMs: number;
    error?: string;
  }>;
  attemptSink?: AttemptSink;
}

/**
 * Execute the staged routing pipeline:
 * 1. Screen (heuristic or lightweight model)
 * 2. Detect (primary model with daily-quota fallback)
 * 3. Verify (stronger verifier for borderline or critical signals)
 */
export async function executeStagedRoute(
  route: StagedRouteDefinition,
  conversation: { id: string; tenantId: string; messages: { role: string; content: string }[] },
  invoker: StageInvoker,
): Promise<StagedExecutionResult> {
  const rawMessages = Array.isArray(conversation?.messages) ? conversation.messages : [];
  const customerMessages = rawMessages
    .filter((m) => m?.role === "customer" && typeof m?.content === "string")
    .map((m) => m.content);

  const stagesExecuted: InferenceStage[] = [];
  const attempts: InferenceAttempt[] = [];
  let totalCostUsd = 0;
  let unknownCost = false;
  const logicalOpId = createInferenceId();
  let ordinal = 1;

  const recordAttempt = (
    stage: InferenceStage,
    model: string,
    usage: InferenceUsage,
    latencyMs: number,
    status: "succeeded" | "failed",
  ) => {
    const boundedLatencyMs = Number.isFinite(latencyMs) ? Math.max(0, latencyMs) : 0;
    const started = new Date(Date.now() - boundedLatencyMs).toISOString();
    const finished = new Date().toISOString();
    const attempt: InferenceAttempt = {
      attemptId: createInferenceId(),
      logicalOperationId: logicalOpId,
      attemptOrdinal: ordinal++,
      tenantId: conversation.tenantId,
      conversationId: conversation.id,
      stage,
      routeVersion: route.routeVersion,
      provider: "groq",
      model,
      promptVersion: "v3",
      startedAt: started,
      finishedAt: finished,
      latencyMs: boundedLatencyMs,
      status,
      usage,
    };
    attempts.push(attempt);
    if (invoker.attemptSink) invoker.attemptSink(attempt);
    const cost = calculateAttemptCostUsd(model, usage);
    if (cost === null) unknownCost = true;
    else totalCostUsd += cost;
  };

  // Stage 1: Screen
  if (route.screenStage.mode !== "pass_through") {
    stagesExecuted.push("screen");
    const screen = evaluateScreenStage(
      { conversationId: conversation.id, customerMessages },
      route.screenStage.rules,
    );
    if (screen.screenedOut) {
      return {
        classification: { type: null, confidence: 1.0, summary: "Screened out by fast pre-filter", quotes: [] },
        stagesExecuted,
        routeVersion: route.routeVersion,
        modelUsed: "rules",
        attempts,
        screenedOut: true,
        totalCostUsd: 0,
      };
    }
  }

  // Stage 2: Detect
  stagesExecuted.push("detect");
  let currentModel = route.detectStage.primaryModel;
  let fallbackTriggered = false;
  let detectCall = await invoker.callModel("detect", currentModel, customerMessages.join("\n"));

  if (detectCall.error === "daily_quota" || detectCall.error === "timeout") {
    recordAttempt("detect", currentModel, detectCall.usage, detectCall.latencyMs, "failed");
    currentModel = route.detectStage.fallbackModel;
    fallbackTriggered = true;
    detectCall = await invoker.callModel("detect", currentModel, customerMessages.join("\n"));
  }
  recordAttempt("detect", currentModel, detectCall.usage, detectCall.latencyMs, detectCall.error ? "failed" : "succeeded");

  let finalClassification = detectCall.output;
  let activeModel = currentModel;

  // Stage 3: Verify
  if (route.verifyStage.enabled && !detectCall.error) {
    const escalation = evaluateVerifyEscalation(
      finalClassification,
      route.verifyStage.escalationRules,
      fallbackTriggered,
    );
    if (escalation.shouldEscalate) {
      stagesExecuted.push("verify");
      const verifierModel = route.verifyStage.verifierModel;
      const verifyCall = await invoker.callModel("verify", verifierModel, customerMessages.join("\n"));
      recordAttempt("verify", verifierModel, verifyCall.usage, verifyCall.latencyMs, verifyCall.error ? "failed" : "succeeded");
      if (!verifyCall.error) {
        finalClassification = verifyCall.output;
        activeModel = verifierModel;
      }
    }
  }

  return {
    classification: finalClassification,
    stagesExecuted,
    routeVersion: route.routeVersion,
    modelUsed: activeModel,
    attempts,
    screenedOut: false,
    totalCostUsd: unknownCost ? null : totalCostUsd,
  };
}

export type CohortBenchmarkInput = {
  routeName: string;
  routeVersion: string;
  totalConversations: number;
  screenedOutCount: number;
  completedCount: number;
  totalCostUsd: number;
  surfacedSignals: {
    lead: number;
    retention: number;
    upsell: number;
    total: number;
  };
  truePositives: {
    lead: number;
    retention: number;
    upsell: number;
    total: number;
  };
  precision: {
    lead: number | null;
    retention: number | null;
    upsell: number | null;
    macro: number | null;
  };
  recall: {
    lead: number | null;
    retention: number | null;
    upsell: number | null;
    macro: number | null;
  };
  evidenceValidityRate: number | null;
};

export type QualityAdjustedBenchmarkResult = {
  routeName: string;
  routeVersion: string;
  costPerConversationUsd: number;
  rawCostPerActionableSignalUsd: number | null;
  qualityAdjustedCostPerActionableSignalUsd: number | null;
  qualityEfficiencyIndex: number | null;
  breakdown: {
    totalCostUsd: number;
    actionableSignalsSurfaced: number;
    validActionableSignals: number;
    effectiveTruePositives: number;
  };
};

/**
 * Calculates Quality-Adjusted Cost per Actionable Signal:
 * AI cost per conversation = totalCost / processed cohort
 * Raw cost per signal = totalCost / surfaced signals
 * Quality-adjusted cost per actionable signal = totalCost / effective true positives
 * (penalizes false positive hallucination and ungrounded evidence)
 */
export function computeQualityAdjustedBenchmark(
  input: CohortBenchmarkInput,
): QualityAdjustedBenchmarkResult {
  const totalEvaluated = Math.max(1, input.completedCount + input.screenedOutCount);
  const costPerConv = input.totalCostUsd / totalEvaluated;
  const surfaced = input.surfacedSignals.total;
  const rawCostPerSignal = surfaced > 0 ? input.totalCostUsd / surfaced : null;

  const precision = input.precision.macro ?? 0;
  const evidenceMultiplier =
    typeof input.evidenceValidityRate === "number" && Number.isFinite(input.evidenceValidityRate)
      ? Math.max(0, Math.min(1, input.evidenceValidityRate))
      : 1;
  const recall = input.recall.macro ?? 0;

  const effectiveTP = input.truePositives.total > 0
    ? input.truePositives.total * evidenceMultiplier
    : surfaced * precision * evidenceMultiplier;

  const qualityAdjustedCost = effectiveTP > 0 ? input.totalCostUsd / effectiveTP : null;
  const qualityScore = precision * recall * evidenceMultiplier;
  const qualityEfficiencyIndex = costPerConv > 0 ? qualityScore / costPerConv : null;

  return {
    routeName: input.routeName,
    routeVersion: input.routeVersion,
    costPerConversationUsd: costPerConv,
    rawCostPerActionableSignalUsd: rawCostPerSignal,
    qualityAdjustedCostPerActionableSignalUsd: qualityAdjustedCost,
    qualityEfficiencyIndex,
    breakdown: {
      totalCostUsd: input.totalCostUsd,
      actionableSignalsSurfaced: surfaced,
      validActionableSignals: Math.round(surfaced * evidenceMultiplier),
      effectiveTruePositives: Math.round(effectiveTP * 100) / 100,
    },
  };
}

export type RouteComparison = {
  baseline: QualityAdjustedBenchmarkResult;
  candidate: QualityAdjustedBenchmarkResult;
  deltaCostPerConversationPct: number;
  deltaQualityAdjustedCostPct: number | null;
  deltaQualityEfficiencyPct: number | null;
  promotable: boolean;
  blockingReasons: string[];
};

/** Compare baseline vs candidate route benchmarks according to D5 promotion thresholds. */
export function compareRouteBenchmarks(
  baseline: QualityAdjustedBenchmarkResult,
  candidate: QualityAdjustedBenchmarkResult,
): RouteComparison {
  const deltaCostPerConvPct =
    ((candidate.costPerConversationUsd - baseline.costPerConversationUsd) /
      Math.max(1e-6, baseline.costPerConversationUsd)) * 100;

  let deltaQualityAdjustedCostPct: number | null = null;
  if (
    baseline.qualityAdjustedCostPerActionableSignalUsd !== null &&
    candidate.qualityAdjustedCostPerActionableSignalUsd !== null
  ) {
    deltaQualityAdjustedCostPct =
      ((candidate.qualityAdjustedCostPerActionableSignalUsd -
        baseline.qualityAdjustedCostPerActionableSignalUsd) /
        Math.max(1e-6, baseline.qualityAdjustedCostPerActionableSignalUsd)) * 100;
  }

  let deltaEfficiencyPct: number | null = null;
  if (
    baseline.qualityEfficiencyIndex !== null &&
    candidate.qualityEfficiencyIndex !== null
  ) {
    deltaEfficiencyPct =
      ((candidate.qualityEfficiencyIndex - baseline.qualityEfficiencyIndex) /
        Math.max(1e-6, baseline.qualityEfficiencyIndex)) * 100;
  }

  const blockingReasons: string[] = [];
  if (
    candidate.qualityAdjustedCostPerActionableSignalUsd === null ||
    (baseline.qualityAdjustedCostPerActionableSignalUsd !== null &&
      candidate.qualityAdjustedCostPerActionableSignalUsd > baseline.qualityAdjustedCostPerActionableSignalUsd)
  ) {
    blockingReasons.push("candidate_increases_quality_adjusted_cost");
  }
  if (
    candidate.breakdown.effectiveTruePositives === 0 ||
    candidate.breakdown.effectiveTruePositives < baseline.breakdown.effectiveTruePositives * 0.95
  ) {
    blockingReasons.push("excessive_quality_regression");
  }

  return {
    baseline,
    candidate,
    deltaCostPerConversationPct: Math.round(deltaCostPerConvPct * 100) / 100,
    deltaQualityAdjustedCostPct:
      deltaQualityAdjustedCostPct !== null
        ? Math.round(deltaQualityAdjustedCostPct * 100) / 100
        : null,
    deltaQualityEfficiencyPct:
      deltaEfficiencyPct !== null
        ? Math.round(deltaEfficiencyPct * 100) / 100
        : null,
    promotable: blockingReasons.length === 0,
    blockingReasons,
  };
}
