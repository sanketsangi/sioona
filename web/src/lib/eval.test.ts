import { describe, expect, it } from "vitest";
import { sampleStore } from "@/data/fixtures/sample-store";
import { runDetection } from "./detect";
import {
  computeEvalMetrics,
  computePilotMetrics,
  REVIEW_PRECISION_TARGET,
  sortSignals,
} from "./eval";
import { mergeSignalsPreservingFeedback } from "./store";
import type { Signal, StoreData } from "./types";

function withSignals(signals: Signal[]): StoreData {
  return {
    ...sampleStore,
    signals,
  };
}

describe("computeEvalMetrics", () => {
  it("reports perfect labeled metrics on fixture set", () => {
    const signals = runDetection(
      sampleStore.conversations,
      sampleStore.messages,
      sampleStore.tenant.id
    );
    const metrics = computeEvalMetrics(withSignals(signals));

    expect(metrics.labeledConversations).toBe(23);
    expect(metrics.labeledPrecision).toBe(1);
    expect(metrics.labeledRecall).toBe(1);
    expect(metrics.byType).toHaveLength(3);
    expect(metrics.byType.every((row) => row.labeledCount === 5)).toBe(true);
    expect(metrics.byType.every((row) => row.precision === 1)).toBe(true);
    expect(metrics.byType.every((row) => row.recall === 1)).toBe(true);
  });

  it("counts false positives on none-labeled conversations", () => {
    const base = runDetection(
      sampleStore.conversations,
      sampleStore.messages,
      sampleStore.tenant.id
    );
    const fake: Signal = {
      id: "sig_fake_none",
      tenantId: "tenant_demo",
      conversationId: "conv_none_01",
      type: "lead",
      score: 0.9,
      confidence: 0.9,
      summary: "false positive",
      suggestedAction: "ignore",
      evidence: ["test"],
      status: "new",
      createdAt: "2026-08-01T00:00:00.000Z",
    };
    const metrics = computeEvalMetrics(withSignals([...base, fake]));
    expect(metrics.falsePositives).toBeGreaterThanOrEqual(1);
    expect(metrics.labeledPrecision).not.toBe(1);
    expect(
      metrics.byType.find((row) => row.type === "lead")?.falsePositives
    ).toBeGreaterThanOrEqual(1);
  });

  it("computes review precision from SignalScore feedback", () => {
    const signals = runDetection(
      sampleStore.conversations,
      sampleStore.messages,
      sampleStore.tenant.id
    ).map((signal, index) =>
      index < 2
        ? {
            ...signal,
            status: "reviewed" as const,
            feedback: {
              label: index === 0 ? ("accept" as const) : ("reject" as const),
              reviewedAt: "2026-08-01T00:00:00.000Z",
            },
          }
        : signal
    );
    const metrics = computeEvalMetrics(withSignals(signals));
    expect(metrics.reviewedCount).toBe(2);
    expect(metrics.acceptedCount).toBe(1);
    expect(metrics.rejectedCount).toBe(1);
    expect(metrics.reviewPrecision).toBe(0.5);
  });
});

describe("computePilotMetrics", () => {
  it("summarizes opportunity lift and go/no-go from labeled precision", () => {
    const signals = runDetection(
      sampleStore.conversations,
      sampleStore.messages,
      sampleStore.tenant.id
    );
    const pilot = computePilotMetrics(withSignals(signals));
    expect(pilot.reviewPrecisionTarget).toBe(REVIEW_PRECISION_TARGET);
    expect(pilot.sioonaOpportunities).toBeGreaterThan(0);
    expect(pilot.labeledOpportunities).toBe(15);
    expect(pilot.baselineOpportunities).toBe(0);
    expect(pilot.opportunityLift).toBe(pilot.sioonaOpportunities);
    expect(pilot.labeledPrecision).toBe(1);
    expect(pilot.goNoGo).toBe("go");
    expect(pilot.offerSummary).toMatch(/Shadow Mode/);
  });

  it("computes lift as sioona opportunities minus partner baseline", () => {
    const signals = runDetection(
      sampleStore.conversations,
      sampleStore.messages,
      sampleStore.tenant.id
    );
    const store = withSignals(signals);
    store.pilot = { baselineOpportunities: 3 };
    const pilot = computePilotMetrics(store);
    expect(pilot.baselineOpportunities).toBe(3);
    expect(pilot.opportunityLift).toBe(pilot.sioonaOpportunities - 3);
  });
});

describe("sortSignals", () => {
  it("orders by score descending then createdAt", () => {
    const sorted = sortSignals([
      {
        id: "a",
        tenantId: "t",
        conversationId: "c1",
        type: "lead",
        score: 0.4,
        confidence: 0.4,
        summary: "",
        suggestedAction: "",
        evidence: [],
        status: "new",
        createdAt: "2026-08-02T00:00:00.000Z",
      },
      {
        id: "b",
        tenantId: "t",
        conversationId: "c2",
        type: "upsell",
        score: 0.9,
        confidence: 0.9,
        summary: "",
        suggestedAction: "",
        evidence: [],
        status: "new",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ]);
    expect(sorted.map((s) => s.id)).toEqual(["b", "a"]);
  });
});

describe("mergeSignalsPreservingFeedback", () => {
  it("keeps feedback when conversation+type still detected", () => {
    const previous: Signal[] = [
      {
        id: "sig_old",
        tenantId: "t",
        conversationId: "c1",
        type: "lead",
        score: 0.4,
        confidence: 0.4,
        summary: "old",
        suggestedAction: "a",
        evidence: ["e1"],
        status: "reviewed",
        createdAt: "2026-01-01T00:00:00.000Z",
        feedback: {
          label: "accept",
          note: "keep",
          reviewedAt: "2026-01-02T00:00:00.000Z",
        },
      },
    ];
    const next: Signal[] = [
      {
        id: "sig_new",
        tenantId: "t",
        conversationId: "c1",
        type: "lead",
        score: 0.95,
        confidence: 0.95,
        summary: "new",
        suggestedAction: "b",
        evidence: ["e2"],
        status: "new",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
    ];
    const merged = mergeSignalsPreservingFeedback(previous, next)[0];
    expect(merged.id).toBe("sig_old");
    expect(merged.score).toBe(0.95);
    expect(merged.feedback?.label).toBe("accept");
    expect(merged.status).toBe("reviewed");
  });
});
