import { describe, expect, it } from "vitest";
import {
  calculateAttemptCostUsd,
  compareRouteBenchmarks,
  computeQualityAdjustedBenchmark,
  evaluateScreenStage,
  evaluateVerifyEscalation,
  executeStagedRoute,
  ROUTE_CANDIDATE_STAGED,
  type InferenceUsage,
  type StageInvoker,
} from "./router";

describe("evaluateScreenStage", () => {
  const rules = { enabled: true, minCharacterCount: 15, requireCustomerTurn: true };

  it("screens out conversations with zero customer turns", () => {
    const decision = evaluateScreenStage(
      { conversationId: "conv-1", customerMessages: [] },
      rules,
    );
    expect(decision.screenedOut).toBe(true);
    expect(decision.reason).toBe("missing_customer_turn");
  });

  it("screens out conversations below character count", () => {
    const decision = evaluateScreenStage(
      { conversationId: "conv-2", customerMessages: ["hello"] },
      rules,
    );
    expect(decision.screenedOut).toBe(true);
    expect(decision.reason).toBe("below_min_characters");
  });

  it("screens out whitespace-only customer messages", () => {
    const decision = evaluateScreenStage(
      { conversationId: "conv-whitespace", customerMessages: ["   ", "\n\t  "] },
      rules,
    );
    expect(decision.screenedOut).toBe(true);
    expect(decision.reason).toBe("missing_customer_turn");
  });

  it("passes conversations satisfying character and customer turn rules", () => {
    const decision = evaluateScreenStage(
      { conversationId: "conv-3", customerMessages: ["We are considering cancelling our enterprise plan next week."] },
      rules,
    );
    expect(decision.screenedOut).toBe(false);
  });

  it("ignores non-string customer messages safely", () => {
    const decision = evaluateScreenStage(
      { conversationId: "conv-nonstring", customerMessages: [null as unknown as string, undefined as unknown as string, 123 as unknown as string] },
      rules,
    );
    expect(decision.screenedOut).toBe(true);
    expect(decision.reason).toBe("missing_customer_turn");
  });

  it("handles null or undefined customerMessages property safely", () => {
    const decision = evaluateScreenStage(
      { conversationId: "conv-null", customerMessages: undefined as unknown as string[] },
      rules,
    );
    expect(decision.screenedOut).toBe(true);
    expect(decision.reason).toBe("missing_customer_turn");
  });
});

describe("evaluateVerifyEscalation", () => {
  const rules = {
    minConfidenceForEscalation: 0.55,
    maxConfidenceForEscalation: 0.85,
    escalateSignalTypes: ["retention" as const],
    escalateMultiTurnQuotes: true,
  };

  it("does not escalate when classification is null or has no signal type", () => {
    const decisionNull = evaluateVerifyEscalation(
      null as unknown as { type: null; confidence: number; quotes: string[] },
      rules,
    );
    expect(decisionNull.shouldEscalate).toBe(false);

    const decision = evaluateVerifyEscalation(
      { type: null, confidence: 0.99, quotes: [] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(false);
  });

  it("does not escalate when confidence is NaN", () => {
    const decision = evaluateVerifyEscalation(
      { type: "lead", confidence: Number.NaN, quotes: ["Quote"] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(false);
  });

  it("escalates on borderline confidence", () => {
    const decision = evaluateVerifyEscalation(
      { type: "lead", confidence: 0.70, quotes: ["I want to buy"] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.reason).toBe("borderline_confidence");
  });

  it("escalates on critical retention signal type regardless of confidence", () => {
    const decision = evaluateVerifyEscalation(
      { type: "retention", confidence: 0.92, quotes: ["Cancel my account"] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.reason).toBe("high_value_signal");
  });

  it("escalates on ambiguous multi-turn quotes", () => {
    const decision = evaluateVerifyEscalation(
      { type: "upsell", confidence: 0.90, quotes: ["Quote 1", "Quote 2"] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.reason).toBe("ambiguous_quotes");
  });

  it("escalates immediately when primary fallback was triggered", () => {
    const decision = evaluateVerifyEscalation(
      { type: "lead", confidence: 0.95, quotes: ["Quote"] },
      rules,
      true,
    );
    expect(decision.shouldEscalate).toBe(true);
    expect(decision.reason).toBe("primary_fallback");
  });

  it("does not escalate for clear non-retention signal with single quote and high confidence", () => {
    const decision = evaluateVerifyEscalation(
      { type: "lead", confidence: 0.95, quotes: ["I want to buy 100 seats"] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(false);
  });

  it("handles missing or undefined quotes property safely", () => {
    const decision = evaluateVerifyEscalation(
      { type: "lead", confidence: 0.95, quotes: undefined as unknown as string[] },
      rules,
    );
    expect(decision.shouldEscalate).toBe(false);
  });
});

describe("executeStagedRoute", () => {
  it("screens out empty conversation early with 0 cost and no detect calls", async () => {
    let detectCalled = false;
    const invoker: StageInvoker = {
      callModel: async () => {
        detectCalled = true;
        throw new Error("Should not be called");
      },
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      { id: "c-empty", tenantId: "t-1", messages: [{ role: "agent", content: "Hi" }] },
      invoker,
    );

    expect(result.screenedOut).toBe(true);
    expect(result.stagesExecuted).toEqual(["screen"]);
    expect(result.totalCostUsd).toBe(0);
    expect(detectCalled).toBe(false);
  });

  it("runs detect and skips verify on high-confidence lead", async () => {
    const usage: InferenceUsage = {
      status: "reported",
      inputTokens: 500,
      cachedInputTokens: 100,
      outputTokens: 50,
      reasoningTokens: null,
    };
    const invoker: StageInvoker = {
      callModel: async (stage, model) => {
        expect(stage).toBe("detect");
        expect(model).toBe("qwen/qwen3.8-27b");
        return {
          output: { type: "lead", confidence: 0.95, summary: "Lead detected", quotes: ["I want to buy"] },
          usage,
          latencyMs: 120,
        };
      },
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      {
        id: "c-lead",
        tenantId: "t-1",
        messages: [{ role: "customer", content: "I want to purchase the enterprise subscription." }],
      },
      invoker,
    );

    expect(result.screenedOut).toBe(false);
    expect(result.stagesExecuted).toEqual(["screen", "detect"]);
    expect(result.classification.type).toBe("lead");
    expect(result.attempts.length).toBe(1);
    expect(result.totalCostUsd).toBeGreaterThan(0);
  });

  it("escalates retention signal to verifier and records both attempts", async () => {
    const detectUsage: InferenceUsage = {
      status: "reported",
      inputTokens: 600,
      cachedInputTokens: 0,
      outputTokens: 80,
      reasoningTokens: null,
    };
    const verifyUsage: InferenceUsage = {
      status: "reported",
      inputTokens: 700,
      cachedInputTokens: 200,
      outputTokens: 100,
      reasoningTokens: null,
    };

    const invoker: StageInvoker = {
      callModel: async (stage, model) => {
        if (stage === "detect") {
          return {
            output: { type: "retention", confidence: 0.90, summary: "Customer unhappy", quotes: ["Cancel service"] },
            usage: detectUsage,
            latencyMs: 150,
          };
        }
        if (stage === "verify") {
          expect(model).toBe("openai/gpt-oss-20b");
          return {
            output: { type: "retention", confidence: 0.96, summary: "Confirmed churn risk", quotes: ["Cancel service"] },
            usage: verifyUsage,
            latencyMs: 200,
          };
        }
        throw new Error("Unexpected stage: " + stage);
      },
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      {
        id: "c-ret",
        tenantId: "t-1",
        messages: [{ role: "customer", content: "Please cancel our service immediately due to high costs." }],
      },
      invoker,
    );

    expect(result.stagesExecuted).toEqual(["screen", "detect", "verify"]);
    expect(result.classification.confidence).toBe(0.96);
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0].stage).toBe("detect");
    expect(result.attempts[1].stage).toBe("verify");
  });

  it("handles primary daily-quota fallback and escalates to verify", async () => {
    const detectUsage: InferenceUsage = {
      status: "reported",
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 60,
      reasoningTokens: null,
    };

    let attemptsCount = 0;
    const invoker: StageInvoker = {
      callModel: async (stage, model) => {
        attemptsCount++;
        if (attemptsCount === 1) {
          expect(model).toBe("qwen/qwen3.8-27b");
          return {
            output: { type: null, confidence: 0, summary: "", quotes: [] },
            usage: detectUsage,
            latencyMs: 50,
            error: "daily_quota",
          };
        }
        if (attemptsCount === 2) {
          expect(model).toBe("openai/gpt-oss-20b");
          return {
            output: { type: "lead", confidence: 0.95, summary: "Lead from fallback", quotes: ["Interested in pricing"] },
            usage: detectUsage,
            latencyMs: 140,
          };
        }
        if (stage === "verify") {
          return {
            output: { type: "lead", confidence: 0.98, summary: "Verified lead", quotes: ["Interested in pricing"] },
            usage: detectUsage,
            latencyMs: 160,
          };
        }
        throw new Error("Unexpected invocation");
      },
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      {
        id: "c-fallback",
        tenantId: "t-1",
        messages: [{ role: "customer", content: "We are interested in pricing for our enterprise team." }],
      },
      invoker,
    );

    expect(result.stagesExecuted).toEqual(["screen", "detect", "verify"]);
    expect(result.attempts.length).toBe(3); // 1 failed detect + 1 fallback detect + 1 verify
    expect(result.attempts[0].status).toBe("failed");
    expect(result.attempts[1].status).toBe("succeeded");
    expect(result.attempts[2].status).toBe("succeeded");
  });

  it("records failed status on detect error and skips verify", async () => {
    const usage: InferenceUsage = {
      status: "reported",
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null,
    };
    const invoker: StageInvoker = {
      callModel: async () => ({
        output: { type: null, confidence: 0, summary: "Rate limit exceeded", quotes: [] },
        usage,
        latencyMs: 80,
        error: "rate_limit",
      }),
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      {
        id: "c-err",
        tenantId: "t-1",
        messages: [{ role: "customer", content: "We want to renew our annual enterprise plan." }],
      },
      invoker,
    );

    expect(result.stagesExecuted).toEqual(["screen", "detect"]);
    expect(result.attempts.length).toBe(1);
    expect(result.attempts[0].status).toBe("failed");
  });

  it("records failed status when verify call fails and preserves detect classification", async () => {
    const detectUsage: InferenceUsage = {
      status: "reported",
      inputTokens: 500,
      cachedInputTokens: 0,
      outputTokens: 60,
      reasoningTokens: null,
    };
    const verifyUsage: InferenceUsage = {
      status: "reported",
      inputTokens: 600,
      cachedInputTokens: 0,
      outputTokens: 0,
      reasoningTokens: null,
    };

    const invoker: StageInvoker = {
      callModel: async (stage) => {
        if (stage === "detect") {
          return {
            output: { type: "retention", confidence: 0.90, summary: "Customer cancellation", quotes: ["cancel our account"] },
            usage: detectUsage,
            latencyMs: 120,
          };
        }
        return {
          output: { type: null, confidence: 0, summary: "Verifier timeout", quotes: [] },
          usage: verifyUsage,
          latencyMs: 5000,
          error: "timeout",
        };
      },
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      {
        id: "c-verify-fail",
        tenantId: "t-1",
        messages: [{ role: "customer", content: "Please cancel our account immediately." }],
      },
      invoker,
    );

    expect(result.stagesExecuted).toEqual(["screen", "detect", "verify"]);
    expect(result.attempts.length).toBe(2);
    expect(result.attempts[0].status).toBe("succeeded");
    expect(result.attempts[1].status).toBe("failed");
    expect(result.classification.type).toBe("retention");
    expect(result.modelUsed).toBe("qwen/qwen3.8-27b");
  });

  it("handles NaN and negative latencyMs safely without throwing RangeError", async () => {
    const invoker: StageInvoker = {
      callModel: async () => ({
        output: { type: null, confidence: 0.9, summary: "Safe", quotes: [] },
        usage: { status: "reported", inputTokens: 100, cachedInputTokens: 0, outputTokens: 20, reasoningTokens: null },
        latencyMs: Number.NaN,
      }),
    };

    const result = await executeStagedRoute(
      ROUTE_CANDIDATE_STAGED,
      {
        id: "c-nan-lat",
        tenantId: "t-1",
        messages: [{ role: "customer", content: "This is a sufficiently long test message." }],
      },
      invoker,
    );

    expect(result.attempts.length).toBe(1);
    expect(result.attempts[0].latencyMs).toBe(0);
    expect(Number.isFinite(Date.parse(result.attempts[0].startedAt))).toBe(true);
  });
});

describe("calculateAttemptCostUsd", () => {
  it("calculates cost for non-cached and cached tokens", () => {
    const cost = calculateAttemptCostUsd("qwen/qwen3.8-27b", {
      status: "reported",
      inputTokens: 1_000_000,
      cachedInputTokens: 500_000, // 500k cached @ $0.10, 500k non-cached @ $0.20 => $0.05 + $0.10 = $0.15
      outputTokens: 500_000,     // 500k @ $0.40 => $0.20
      reasoningTokens: null,
    });
    expect(cost).toBeCloseTo(0.35, 4);
  });

  it("returns null for unknown usage or negative/non-finite token counts", () => {
    const costUnknown = calculateAttemptCostUsd("qwen/qwen3.8-27b", {
      status: "unknown",
      inputTokens: null,
      cachedInputTokens: null,
      outputTokens: null,
      reasoningTokens: null,
    });
    expect(costUnknown).toBeNull();

    const costNegative = calculateAttemptCostUsd("qwen/qwen3.8-27b", {
      status: "reported",
      inputTokens: -100,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningTokens: null,
    });
    expect(costNegative).toBeNull();

    const costNaN = calculateAttemptCostUsd("qwen/qwen3.8-27b", {
      status: "reported",
      inputTokens: Number.NaN,
      cachedInputTokens: 0,
      outputTokens: 50,
      reasoningTokens: null,
    });
    expect(costNaN).toBeNull();
  });

  it("safely handles NaN cachedInputTokens by defaulting to 0", () => {
    const cost = calculateAttemptCostUsd("qwen/qwen3.8-27b", {
      status: "reported",
      inputTokens: 1_000_000,
      cachedInputTokens: Number.NaN,
      outputTokens: 0,
      reasoningTokens: null,
    });
    // 1M non-cached @ $0.20 => $0.20
    expect(cost).toBeCloseTo(0.20, 4);
  });

  it("clamps cached input tokens when reported higher than total input tokens", () => {
    const cost = calculateAttemptCostUsd("qwen/qwen3.8-27b", {
      status: "reported",
      inputTokens: 1_000_000,
      cachedInputTokens: 1_500_000,
      outputTokens: 0,
      reasoningTokens: null,
    });
    // 1M cached @ $0.10 => $0.10
    expect(cost).toBeCloseTo(0.10, 4);
  });
});

describe("computeQualityAdjustedBenchmark & compareRouteBenchmarks", () => {
  it("computes quality-adjusted cost per actionable signal accurately", () => {
    const benchmark = computeQualityAdjustedBenchmark({
      routeName: "baseline_qwen",
      routeVersion: "route:baseline:v1",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.12,
      surfacedSignals: { lead: 30, retention: 30, upsell: 28, total: 88 },
      truePositives: { lead: 28, retention: 27, upsell: 25, total: 80 },
      precision: { lead: 0.933, retention: 0.90, upsell: 0.893, macro: 0.909 },
      recall: { lead: 0.933, retention: 0.90, upsell: 0.833, macro: 0.889 },
      evidenceValidityRate: 0.98,
    });

    expect(benchmark.costPerConversationUsd).toBeCloseTo(0.001, 5);
    expect(benchmark.rawCostPerActionableSignalUsd).toBeCloseTo(0.12 / 88, 5);
    // Effective TP = 80 * 0.98 = 78.4
    expect(benchmark.qualityAdjustedCostPerActionableSignalUsd).toBeCloseTo(0.12 / 78.4, 5);
    expect(benchmark.qualityEfficiencyIndex).toBeGreaterThan(0);
  });

  it("rewards candidate route that lowers quality-adjusted cost with preserved accuracy", () => {
    const baseline = computeQualityAdjustedBenchmark({
      routeName: "baseline_qwen",
      routeVersion: "route:baseline:v1",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.20,
      surfacedSignals: { lead: 30, retention: 30, upsell: 30, total: 90 },
      truePositives: { lead: 27, retention: 27, upsell: 27, total: 81 },
      precision: { lead: 0.90, retention: 0.90, upsell: 0.90, macro: 0.90 },
      recall: { lead: 0.90, retention: 0.90, upsell: 0.90, macro: 0.90 },
      evidenceValidityRate: 0.95,
    });

    const candidate = computeQualityAdjustedBenchmark({
      routeName: "candidate_staged",
      routeVersion: "route:staged:v1",
      totalConversations: 120,
      screenedOutCount: 20, // 20 conversations screened out cheaply
      completedCount: 100,
      totalCostUsd: 0.12,  // 40% cheaper
      surfacedSignals: { lead: 30, retention: 30, upsell: 29, total: 89 },
      truePositives: { lead: 27, retention: 27, upsell: 26, total: 80 },
      precision: { lead: 0.90, retention: 0.90, upsell: 0.897, macro: 0.899 },
      recall: { lead: 0.90, retention: 0.90, upsell: 0.867, macro: 0.889 },
      evidenceValidityRate: 0.96,
    });

    const comparison = compareRouteBenchmarks(baseline, candidate);
    expect(comparison.deltaCostPerConversationPct).toBeLessThan(-30);
    expect(comparison.deltaQualityAdjustedCostPct).toBeLessThan(-30);
    expect(comparison.promotable).toBe(true);
    expect(comparison.blockingReasons).toEqual([]);
  });

  it("blocks candidate route that increases quality-adjusted cost or regresses recall", () => {
    const baseline = computeQualityAdjustedBenchmark({
      routeName: "baseline_qwen",
      routeVersion: "route:baseline:v1",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.15,
      surfacedSignals: { lead: 30, retention: 30, upsell: 30, total: 90 },
      truePositives: { lead: 28, retention: 28, upsell: 28, total: 84 },
      precision: { lead: 0.933, retention: 0.933, upsell: 0.933, macro: 0.933 },
      recall: { lead: 0.933, retention: 0.933, upsell: 0.933, macro: 0.933 },
      evidenceValidityRate: 0.98,
    });

    // Hallucinates extra false positives resulting in low precision
    const badCandidate = computeQualityAdjustedBenchmark({
      routeName: "candidate_hallucinating",
      routeVersion: "route:candidate:v2",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.16,
      surfacedSignals: { lead: 50, retention: 40, upsell: 40, total: 130 },
      truePositives: { lead: 20, retention: 20, upsell: 20, total: 60 },
      precision: { lead: 0.40, retention: 0.50, upsell: 0.50, macro: 0.467 },
      recall: { lead: 0.667, retention: 0.667, upsell: 0.667, macro: 0.667 },
      evidenceValidityRate: 0.70,
    });

    const comparison = compareRouteBenchmarks(baseline, badCandidate);
    expect(comparison.promotable).toBe(false);
    expect(comparison.blockingReasons).toContain("candidate_increases_quality_adjusted_cost");
    expect(comparison.blockingReasons).toContain("excessive_quality_regression");
  });

  it("penalizes zero evidence validity to 0 effective true positives and null cost", () => {
    const benchmark = computeQualityAdjustedBenchmark({
      routeName: "candidate_hallucinating_quotes",
      routeVersion: "route:candidate:v3",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.12,
      surfacedSignals: { lead: 30, retention: 30, upsell: 30, total: 90 },
      truePositives: { lead: 25, retention: 25, upsell: 25, total: 75 },
      precision: { lead: 0.833, retention: 0.833, upsell: 0.833, macro: 0.833 },
      recall: { lead: 0.833, retention: 0.833, upsell: 0.833, macro: 0.833 },
      evidenceValidityRate: 0, // 100% hallucinations!
    });

    expect(benchmark.breakdown.effectiveTruePositives).toBe(0);
    expect(benchmark.breakdown.validActionableSignals).toBe(0);
    expect(benchmark.qualityAdjustedCostPerActionableSignalUsd).toBeNull();
    expect(benchmark.qualityEfficiencyIndex).toBe(0);
  });

  it("handles unmeasured (null) evidence validity by defaulting multiplier to 1", () => {
    const benchmark = computeQualityAdjustedBenchmark({
      routeName: "unmeasured_evidence",
      routeVersion: "route:candidate:v4",
      totalConversations: 100,
      screenedOutCount: 0,
      completedCount: 100,
      totalCostUsd: 0.10,
      surfacedSignals: { lead: 20, retention: 20, upsell: 20, total: 60 },
      truePositives: { lead: 18, retention: 18, upsell: 18, total: 54 },
      precision: { lead: 0.90, retention: 0.90, upsell: 0.90, macro: 0.90 },
      recall: { lead: 0.90, retention: 0.90, upsell: 0.90, macro: 0.90 },
      evidenceValidityRate: null,
    });

    expect(benchmark.breakdown.effectiveTruePositives).toBe(54);
    expect(benchmark.breakdown.validActionableSignals).toBe(60);
    expect(benchmark.qualityAdjustedCostPerActionableSignalUsd).toBeCloseTo(0.10 / 54, 5);
  });

  it("blocks candidate when baseline has measurable cost but candidate has null cost", () => {
    const baseline = computeQualityAdjustedBenchmark({
      routeName: "baseline_qwen",
      routeVersion: "route:baseline:v1",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.15,
      surfacedSignals: { lead: 30, retention: 30, upsell: 30, total: 90 },
      truePositives: { lead: 28, retention: 28, upsell: 28, total: 84 },
      precision: { lead: 0.933, retention: 0.933, upsell: 0.933, macro: 0.933 },
      recall: { lead: 0.933, retention: 0.933, upsell: 0.933, macro: 0.933 },
      evidenceValidityRate: 0.98,
    });

    const candidateZeroSignals = computeQualityAdjustedBenchmark({
      routeName: "candidate_silent",
      routeVersion: "route:candidate:v5",
      totalConversations: 120,
      screenedOutCount: 0,
      completedCount: 120,
      totalCostUsd: 0.05,
      surfacedSignals: { lead: 0, retention: 0, upsell: 0, total: 0 },
      truePositives: { lead: 0, retention: 0, upsell: 0, total: 0 },
      precision: { lead: null, retention: null, upsell: null, macro: null },
      recall: { lead: 0, retention: 0, upsell: 0, macro: 0 },
      evidenceValidityRate: null,
    });

    const comparison = compareRouteBenchmarks(baseline, candidateZeroSignals);
    expect(comparison.promotable).toBe(false);
    expect(comparison.blockingReasons).toContain("candidate_increases_quality_adjusted_cost");
  });

  it("strictly blocks candidate with zero effective true positives even when baseline is also zero", () => {
    const zeroBaseline = computeQualityAdjustedBenchmark({
      routeName: "baseline_zero",
      routeVersion: "route:baseline:zero",
      totalConversations: 50,
      screenedOutCount: 0,
      completedCount: 50,
      totalCostUsd: 0.01,
      surfacedSignals: { lead: 0, retention: 0, upsell: 0, total: 0 },
      truePositives: { lead: 0, retention: 0, upsell: 0, total: 0 },
      precision: { lead: null, retention: null, upsell: null, macro: null },
      recall: { lead: 0, retention: 0, upsell: 0, macro: 0 },
      evidenceValidityRate: null,
    });

    const zeroCandidate = computeQualityAdjustedBenchmark({
      routeName: "candidate_zero",
      routeVersion: "route:candidate:zero",
      totalConversations: 50,
      screenedOutCount: 0,
      completedCount: 50,
      totalCostUsd: 0.01,
      surfacedSignals: { lead: 0, retention: 0, upsell: 0, total: 0 },
      truePositives: { lead: 0, retention: 0, upsell: 0, total: 0 },
      precision: { lead: null, retention: null, upsell: null, macro: null },
      recall: { lead: 0, retention: 0, upsell: 0, macro: 0 },
      evidenceValidityRate: null,
    });

    const comparison = compareRouteBenchmarks(zeroBaseline, zeroCandidate);
    expect(comparison.promotable).toBe(false);
    expect(comparison.blockingReasons).toContain("candidate_increases_quality_adjusted_cost");
    expect(comparison.blockingReasons).toContain("excessive_quality_regression");
  });

  it("safely handles baseline with zero cost or efficiency without producing NaN or Infinity", () => {
    const freeBaseline = computeQualityAdjustedBenchmark({
      routeName: "baseline_free",
      routeVersion: "route:baseline:free",
      totalConversations: 10,
      screenedOutCount: 0,
      completedCount: 10,
      totalCostUsd: 0,
      surfacedSignals: { lead: 5, retention: 0, upsell: 0, total: 5 },
      truePositives: { lead: 5, retention: 0, upsell: 0, total: 5 },
      precision: { lead: 1.0, retention: null, upsell: null, macro: 1.0 },
      recall: { lead: 1.0, retention: 0, upsell: 0, macro: 1.0 },
      evidenceValidityRate: 1.0,
    });

    const candidate = computeQualityAdjustedBenchmark({
      routeName: "candidate_paid",
      routeVersion: "route:candidate:paid",
      totalConversations: 10,
      screenedOutCount: 0,
      completedCount: 10,
      totalCostUsd: 0.05,
      surfacedSignals: { lead: 5, retention: 0, upsell: 0, total: 5 },
      truePositives: { lead: 5, retention: 0, upsell: 0, total: 5 },
      precision: { lead: 1.0, retention: null, upsell: null, macro: 1.0 },
      recall: { lead: 1.0, retention: 0, upsell: 0, macro: 1.0 },
      evidenceValidityRate: 1.0,
    });

    const comparison = compareRouteBenchmarks(freeBaseline, candidate);
    expect(Number.isFinite(comparison.deltaCostPerConversationPct)).toBe(true);
    if (comparison.deltaQualityAdjustedCostPct !== null) {
      expect(Number.isFinite(comparison.deltaQualityAdjustedCostPct)).toBe(true);
    }
  });

  it("handles undefined and out-of-range evidenceValidityRate gracefully without NaN", () => {
    const unmeasured = computeQualityAdjustedBenchmark({
      routeName: "unmeasured_cohort",
      routeVersion: "route:unmeasured",
      totalConversations: 10,
      screenedOutCount: 0,
      completedCount: 10,
      totalCostUsd: 0.10,
      surfacedSignals: { lead: 6, retention: 0, upsell: 0, total: 6 },
      truePositives: { lead: 5, retention: 0, upsell: 0, total: 5 },
      precision: { lead: 0.833, retention: null, upsell: null, macro: 0.833 },
      recall: { lead: 1.0, retention: 0, upsell: 0, macro: 1.0 },
      evidenceValidityRate: undefined as unknown as null,
    });

    expect(Number.isFinite(unmeasured.breakdown.validActionableSignals)).toBe(true);
    expect(unmeasured.breakdown.validActionableSignals).toBe(6);
    expect(Number.isFinite(unmeasured.breakdown.effectiveTruePositives)).toBe(true);
    expect(unmeasured.breakdown.effectiveTruePositives).toBe(5);
    expect(Number.isFinite(unmeasured.qualityEfficiencyIndex)).toBe(true);

    const clamped = computeQualityAdjustedBenchmark({
      routeName: "clamped_cohort",
      routeVersion: "route:clamped",
      totalConversations: 10,
      screenedOutCount: 0,
      completedCount: 10,
      totalCostUsd: 0.10,
      surfacedSignals: { lead: 6, retention: 0, upsell: 0, total: 6 },
      truePositives: { lead: 5, retention: 0, upsell: 0, total: 5 },
      precision: { lead: 0.833, retention: null, upsell: null, macro: 0.833 },
      recall: { lead: 1.0, retention: 0, upsell: 0, macro: 1.0 },
      evidenceValidityRate: 1.5, // should be clamped to 1.0
    });
    expect(clamped.breakdown.validActionableSignals).toBe(6);
  });

  it("computes deltaQualityEfficiencyPct accurately when candidate efficiency drops to zero", () => {
    const efficientBaseline = computeQualityAdjustedBenchmark({
      routeName: "efficient_baseline",
      routeVersion: "route:baseline",
      totalConversations: 10,
      screenedOutCount: 0,
      completedCount: 10,
      totalCostUsd: 0.10,
      surfacedSignals: { lead: 5, retention: 0, upsell: 0, total: 5 },
      truePositives: { lead: 5, retention: 0, upsell: 0, total: 5 },
      precision: { lead: 1.0, retention: null, upsell: null, macro: 1.0 },
      recall: { lead: 1.0, retention: 0, upsell: 0, macro: 1.0 },
      evidenceValidityRate: 1.0,
    });

    const zeroEfficiencyCandidate = computeQualityAdjustedBenchmark({
      routeName: "zero_eff_candidate",
      routeVersion: "route:candidate",
      totalConversations: 10,
      screenedOutCount: 0,
      completedCount: 10,
      totalCostUsd: 0.10,
      surfacedSignals: { lead: 5, retention: 0, upsell: 0, total: 5 },
      truePositives: { lead: 0, retention: 0, upsell: 0, total: 0 },
      precision: { lead: 0, retention: null, upsell: null, macro: 0 },
      recall: { lead: 0, retention: 0, upsell: 0, macro: 0 },
      evidenceValidityRate: 1.0,
    });

    const comparison = compareRouteBenchmarks(efficientBaseline, zeroEfficiencyCandidate);
    // Efficiency dropped from ~100 to 0: delta should be -100%, NOT null!
    expect(comparison.deltaQualityEfficiencyPct).toBe(-100);
  });
});

describe("offline synthetic replay through staged routing pipeline", () => {
  it("replays synthetic conversation batch through staged route without provider calls", async () => {
    const syntheticItems = [
      { id: "synth-ret-1", role: "customer", text: "We need to cancel our contract due to budget constraints." },
      { id: "synth-lead-1", role: "customer", text: "We want to purchase 500 licenses for our new division." },
      { id: "synth-upsell-1", role: "customer", text: "Can we upgrade our tier to access the reporting API?" },
      { id: "synth-none-1", role: "customer", text: "Thanks, the invoice is paid." },
      { id: "synth-empty-1", role: "agent", text: "Hello, how can I help you today?" },
    ];

    const attemptsEmitted: unknown[] = [];
    const invoker: StageInvoker = {
      attemptSink: (a) => attemptsEmitted.push(a),
      callModel: async (stage, model, prompt) => {
        if (prompt.includes("cancel")) {
          return {
            output: { type: "retention", confidence: 0.92, summary: "Cancellation intent", quotes: ["cancel our contract"] },
            usage: { status: "reported", inputTokens: 400, cachedInputTokens: 100, outputTokens: 50, reasoningTokens: null },
            latencyMs: 110,
          };
        }
        if (prompt.includes("purchase")) {
          return {
            output: { type: "lead", confidence: 0.95, summary: "Expansion lead", quotes: ["purchase 500 licenses"] },
            usage: { status: "reported", inputTokens: 400, cachedInputTokens: 100, outputTokens: 50, reasoningTokens: null },
            latencyMs: 95,
          };
        }
        if (prompt.includes("upgrade")) {
          return {
            output: { type: "upsell", confidence: 0.88, summary: "Tier upgrade", quotes: ["upgrade our tier"] },
            usage: { status: "reported", inputTokens: 400, cachedInputTokens: 100, outputTokens: 50, reasoningTokens: null },
            latencyMs: 105,
          };
        }
        return {
          output: { type: null, confidence: 0.99, summary: "No actionable signal", quotes: [] },
          usage: { status: "reported", inputTokens: 350, cachedInputTokens: 50, outputTokens: 30, reasoningTokens: null },
          latencyMs: 80,
        };
      },
    };

    const results = [];
    for (const item of syntheticItems) {
      const res = await executeStagedRoute(
        ROUTE_CANDIDATE_STAGED,
        { id: item.id, tenantId: "tenant_rehearsal", messages: [{ role: item.role, content: item.text }] },
        invoker,
      );
      results.push(res);
    }

    expect(results.length).toBe(5);
    // synth-empty-1 should be screened out by screen stage (0 customer turns)
    const emptyRes = results.find((r) => r.screenedOut);
    expect(emptyRes).toBeDefined();
    expect(emptyRes?.stagesExecuted).toEqual(["screen"]);

    // Retention item should execute verify stage
    const retRes = results.find((r) => r.classification.type === "retention");
    expect(retRes?.stagesExecuted).toEqual(["screen", "detect", "verify"]);

    // Lead item should only execute detect (confidence > 0.82)
    const leadRes = results.find((r) => r.classification.type === "lead");
    expect(leadRes?.stagesExecuted).toEqual(["screen", "detect"]);

    expect(attemptsEmitted.length).toBeGreaterThan(0);
  });
});
