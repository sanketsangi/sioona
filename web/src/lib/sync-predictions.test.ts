import { afterEach, describe, expect, it, vi } from "vitest";
import { applyBackendSignalScore, computeEvalMetrics } from "./eval";
import { syncPredictionsToBackend } from "./sync-predictions";
import type { Signal, StoreData } from "./types";

const baseSignal: Signal = {
  id: "sig_local_1",
  tenantId: "tenant_demo",
  conversationId: "conv_1",
  type: "lead",
  score: 0.9,
  confidence: 0.9,
  summary: "Buying intent",
  suggestedAction: "Follow up",
  evidence: [],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
};

const createdBody = {
  id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  tenant_id: "tenant_demo",
  conversation_id: "conv_1",
  signal_type: "lead",
  confidence: 0.9,
  summary: "Buying intent",
  created_at: "2026-08-01T00:00:00.000Z",
};

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("syncPredictionsToBackend", () => {
  it("dual-writes prediction and stores backendSignalId", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => createdBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    const { signals, sync } = await syncPredictionsToBackend(
      [baseSignal],
      "tenant_demo"
    );

    expect(signals[0].backendSignalId).toBe(
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"
    );
    expect(sync).toEqual({
      attempted: 1,
      created: 1,
      failed: 0,
      skipped: 0,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/predictions"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
  });

  it("skips signals that already have backendSignalId", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { signals, sync } = await syncPredictionsToBackend(
      [{ ...baseSignal, backendSignalId: "existing-id" }],
      "tenant_demo"
    );

    expect(signals[0].backendSignalId).toBe("existing-id");
    expect(sync.skipped).toBe(1);
    expect(sync.attempted).toBe(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries once then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => createdBody,
      });
    vi.stubGlobal("fetch", fetchMock);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { signals, sync } = await syncPredictionsToBackend(
      [baseSignal],
      "tenant_demo"
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(signals[0].backendSignalId).toBe(createdBody.id);
    expect(sync.created).toBe(1);
    expect(sync.failed).toBe(0);
    expect(warn).not.toHaveBeenCalled();
  });

  it("leaves signal unchanged and counts failure when backend stays down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { signals, sync } = await syncPredictionsToBackend(
      [baseSignal],
      "tenant_demo"
    );
    expect(signals[0].backendSignalId).toBeUndefined();
    expect(sync.failed).toBe(1);
    expect(sync.created).toBe(0);
    expect(warn).toHaveBeenCalled();
  });
});

describe("dual-write → SignalScore overlay contract", () => {
  it("applies Neon score after dual-write path", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({
          id: "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb",
          tenant_id: "tenant_demo",
          conversation_id: "conv_1",
          signal_type: "lead",
          confidence: 0.9,
          summary: "Buying intent",
          created_at: "2026-08-01T00:00:00.000Z",
        }),
      })
    );

    const { signals } = await syncPredictionsToBackend(
      [baseSignal],
      "tenant_demo"
    );
    expect(signals[0].backendSignalId).toBeTruthy();

    const emptyStore: StoreData = {
      tenant: {
        id: "tenant_demo",
        name: "Demo",
        createdAt: "2026-01-01T00:00:00.000Z",
      },
      conversations: [],
      messages: [],
      signals,
    };
    const local = computeEvalMetrics(emptyStore);
    const overlaid = applyBackendSignalScore(local, {
      tenant_id: "tenant_demo",
      signal_score: 1,
      reviewed_count: 1,
      correct_count: 1,
      incorrect_count: 0,
      partially_correct_count: 0,
      by_signal_type: [
        {
          signal_type: "lead",
          signal_score: 1,
          reviewed_count: 1,
          correct_count: 1,
          incorrect_count: 0,
          partially_correct_count: 0,
        },
      ],
    });

    expect(overlaid.signalScoreFromBackend).toBe(true);
    expect(overlaid.reviewPrecision).toBe(1);
    expect(overlaid.correctCount).toBe(1);
    expect(overlaid.reviewedCount).toBe(1);
  });
});
