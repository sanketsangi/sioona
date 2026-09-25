import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "./types";

vi.mock("./backend-client", () => ({
  submitFeedback: vi.fn(),
}));

import { submitFeedback } from "./backend-client";
import {
  feedbackReplayCandidates,
  replayAbsentFeedback,
} from "./replay-absent-feedback";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "May leave",
    suggestedAction: "Call back",
    evidence: [],
    status: "reviewed",
    createdAt: "2026-08-01T00:00:00.000Z",
    backendSignalId: "pred-1",
    feedback: {
      label: "correct",
      note: "clear leave intent",
      reviewedAt: "2026-08-02T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("feedbackReplayCandidates", () => {
  it("keeps canonical reviews that already have a Neon id", () => {
    const rows = feedbackReplayCandidates([
      signal(),
      signal({ id: "sig_open", feedback: undefined, backendSignalId: "pred-2" }),
      signal({ id: "sig_local", backendSignalId: undefined }),
      signal({
        id: "sig_legacy",
        feedback: {
          label: "accept" as never,
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["sig_1"]);
  });
});

describe("replayAbsentFeedback", () => {
  beforeEach(() => {
    vi.mocked(submitFeedback).mockReset();
    vi.mocked(submitFeedback).mockResolvedValue({
      id: "fb-1",
      tenant_id: "tenant_demo",
      signal_id: "pred-1",
      feedback: "correct",
      note: "clear leave intent",
      reviewed_by: "shadow_reviewer",
      reviewed_at: "2026-08-02T00:00:00.000Z",
    });
  });

  it("inserts only when absent and keeps the original reviewedAt", async () => {
    const stats = await replayAbsentFeedback("tenant_demo", [
      signal(),
      signal({ id: "sig_partial", type: "upsell", backendSignalId: "pred-2", feedback: {
        label: "partially_correct",
        reviewedAt: "not-a-date",
      } }),
    ]);

    expect(stats).toEqual({ attempted: 2, failed: 0 });
    expect(submitFeedback).toHaveBeenCalledWith("tenant_demo", "pred-1", {
      feedback: "correct",
      reviewed_by: "shadow_reviewer",
      note: "clear leave intent",
      reviewed_at: "2026-08-02T00:00:00.000Z",
      if_absent: true,
    });
    expect(submitFeedback).toHaveBeenCalledWith(
      "tenant_demo",
      "pred-2",
      expect.objectContaining({
        feedback: "partially_correct",
        if_absent: true,
        reviewed_at: undefined,
      })
    );
  });

  it("counts a failed row and continues", async () => {
    vi.mocked(submitFeedback)
      .mockRejectedValueOnce(new Error("backend down"))
      .mockResolvedValueOnce({
        id: "fb-2",
        tenant_id: "tenant_demo",
        signal_id: "pred-2",
        feedback: "incorrect",
        note: null,
        reviewed_by: "shadow_reviewer",
        reviewed_at: "2026-08-03T00:00:00.000Z",
      });

    const stats = await replayAbsentFeedback("tenant_demo", [
      signal(),
      signal({
        id: "sig_2",
        backendSignalId: "pred-2",
        feedback: {
          label: "incorrect",
          reviewedAt: "2026-08-03T00:00:00.000Z",
        },
      }),
    ]);

    expect(stats.attempted).toBe(2);
    expect(stats.failed).toBe(1);
    expect(submitFeedback).toHaveBeenCalledTimes(2);
  });
});
