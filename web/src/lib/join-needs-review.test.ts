import { describe, expect, it } from "vitest";
import type { BackendPrediction } from "./backend-client";
import {
  doneQueueSignals,
  joinNeedsReviewPredictions,
  pendingQueueSignals,
  predictionToStubSignal,
  reviewedSignalsFromStore,
} from "./join-needs-review";
import type { Signal } from "./types";

const prediction = (
  overrides: Partial<BackendPrediction> & Pick<BackendPrediction, "id">
): BackendPrediction => ({
  tenant_id: "tenant_demo",
  conversation_id: "conv_1",
  signal_type: "lead",
  confidence: 0.9,
  summary: "Buying intent",
  created_at: "2026-08-01T00:00:00.000Z",
  ...overrides,
});

const baseSignal: Signal = {
  id: "sig_local_1",
  tenantId: "tenant_demo",
  conversationId: "conv_1",
  type: "lead",
  score: 0.9,
  confidence: 0.9,
  summary: "Local summary",
  suggestedAction: "Follow up",
  evidence: ["quote"],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
};

describe("joinNeedsReviewPredictions", () => {
  it("joins by backendSignalId and preserves Neon order", () => {
    const preds = [
      prediction({ id: "bbb", conversation_id: "conv_2", signal_type: "upsell" }),
      prediction({ id: "aaa", conversation_id: "conv_1", signal_type: "lead" }),
    ];
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_a",
        backendSignalId: "aaa",
        conversationId: "conv_1",
        type: "lead",
      },
      {
        ...baseSignal,
        id: "sig_b",
        backendSignalId: "bbb",
        conversationId: "conv_2",
        type: "upsell",
        summary: "Upsell local",
        evidence: ["upsell quote"],
      },
    ];

    const joined = joinNeedsReviewPredictions(preds, json);
    expect(joined.map((s) => s.id)).toEqual(["sig_b", "sig_a"]);
    expect(joined[0].evidence).toEqual(["upsell quote"]);
    expect(joined[0].backendSignalId).toBe("bbb");
  });

  it("falls back to conversationId + signal_type", () => {
    const preds = [prediction({ id: "neon-1" })];
    const json: Signal[] = [{ ...baseSignal, id: "sig_match" }];

    const [joined] = joinNeedsReviewPredictions(preds, json);
    expect(joined.id).toBe("sig_match");
    expect(joined.backendSignalId).toBe("neon-1");
    expect(joined.evidence).toEqual(["quote"]);
  });

  it("omits unmatched Neon predictions (stale demo / no local chat)", () => {
    const preds = [
      prediction({
        id: "orphan",
        conversation_id: "conv_x",
        summary: "Neon only",
      }),
    ];
    const joined = joinNeedsReviewPredictions(preds, [baseSignal]);
    expect(joined).toHaveLength(0);
  });

  it("omits JSON matches that already have feedback", () => {
    const preds = [prediction({ id: "aaa" })];
    const json: Signal[] = [
      {
        ...baseSignal,
        backendSignalId: "aaa",
        feedback: {
          label: "correct",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
        status: "reviewed",
      },
    ];
    const joined = joinNeedsReviewPredictions(preds, json);
    expect(joined).toHaveLength(0);
  });

  it("dedupes when multiple Neon predictions match one JSON signal", () => {
    const preds = [
      prediction({ id: "neon-first", created_at: "2026-08-03T00:00:00.000Z" }),
      prediction({ id: "neon-second", created_at: "2026-08-02T00:00:00.000Z" }),
    ];
    const json: Signal[] = [{ ...baseSignal, id: "sig_shared" }];

    const joined = joinNeedsReviewPredictions(preds, json);
    expect(joined).toHaveLength(1);
    expect(joined[0].id).toBe("sig_shared");
    expect(joined[0].backendSignalId).toBe("neon-first");
  });
});

describe("predictionToStubSignal", () => {
  it("maps prediction fields", () => {
    const stub = predictionToStubSignal(prediction({ id: "x" }));
    expect(stub.backendSignalId).toBe("x");
    expect(stub.type).toBe("lead");
  });
});

describe("reviewedSignalsFromStore", () => {
  it("keeps only signals with feedback", () => {
    const reviewed = reviewedSignalsFromStore([
      baseSignal,
      {
        ...baseSignal,
        id: "sig_r",
        feedback: {
          label: "incorrect",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      },
    ]);
    expect(reviewed.map((s) => s.id)).toEqual(["sig_r"]);
  });
});

describe("pendingQueueSignals", () => {
  it("keeps Neon join order then appends local unreviewed Neon missed", () => {
    const preds = [prediction({ id: "aaa" })];
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_neon",
        backendSignalId: "aaa",
      },
      {
        ...baseSignal,
        id: "sig_local_only",
        conversationId: "conv_local",
        summary: "Local only",
      },
      {
        ...baseSignal,
        id: "sig_reviewed",
        conversationId: "conv_done",
        feedback: {
          label: "correct",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      },
    ];

    const pending = pendingQueueSignals(preds, json);
    expect(pending.map((s) => s.id)).toEqual(["sig_neon", "sig_local_only"]);
  });

  it("surfaces keep-set locals when Neon queue has no overlapping chats", () => {
    const preds = [
      prediction({
        id: "stale",
        conversation_id: "conv_other_pack",
      }),
    ];
    const json: Signal[] = [
      { ...baseSignal, id: "sig_a" },
      { ...baseSignal, id: "sig_b", conversationId: "conv_2", type: "retention" },
    ];

    const pending = pendingQueueSignals(preds, json);
    expect(pending.map((s) => s.id)).toEqual(["sig_a", "sig_b"]);
  });
});

describe("doneQueueSignals", () => {
  it("joins Neon feedback onto keep-set JSON and overlays Acted", () => {
    const rows = [
      {
        ...prediction({ id: "neon-done" }),
        acted: true,
        feedback: {
          id: "fb-1",
          tenant_id: "tenant_demo",
          signal_id: "neon-done",
          feedback: "correct" as const,
          note: "clear",
          reviewed_by: "shadow_reviewer",
          reviewed_at: "2026-08-02T00:00:00.000Z",
        },
      },
    ];
    const json: Signal[] = [{ ...baseSignal, id: "sig_keep" }];

    const done = doneQueueSignals(rows, json);
    expect(done).toHaveLength(1);
    expect(done[0].id).toBe("sig_keep");
    expect(done[0].status).toBe("acted");
    expect(done[0].backendSignalId).toBe("neon-done");
    expect(done[0].feedback).toEqual({
      label: "correct",
      note: "clear",
      reviewedAt: "2026-08-02T00:00:00.000Z",
    });
  });

  it("omits leftover Groww Neon reviews with no local Zerodha chat", () => {
    const rows = [
      {
        ...prediction({
          id: "groww-leftover",
          conversation_id: "conv_eeshan_kulkarni_41",
        }),
        acted: false,
        feedback: {
          id: "fb-g",
          tenant_id: "tenant_demo",
          signal_id: "groww-leftover",
          feedback: "correct" as const,
          note: null,
          reviewed_by: "shadow_reviewer",
          reviewed_at: "2026-08-18T00:00:00.000Z",
        },
      },
    ];
    const json: Signal[] = [
      {
        ...baseSignal,
        id: "sig_zrdh",
        conversationId: "conv_zrdh_eeshan_kulkarni_41",
      },
    ];

    expect(doneQueueSignals(rows, json)).toEqual([]);
  });

  it("omits unreviewed tenant rows (those belong in Follow-up)", () => {
    const rows = [
      {
        ...prediction({ id: "pending" }),
        acted: false,
        feedback: null,
      },
    ];
    expect(doneQueueSignals(rows, [baseSignal])).toEqual([]);
  });
});
