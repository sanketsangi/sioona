import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDeferredPredictionSyncResult,
  mergeSyncedBackendIds,
  persistDeferredPredictionSync,
} from "./defer-prediction-sync";
import type { Signal, StoreData } from "./types";

vi.mock("./store", () => ({
  readStore: vi.fn(),
  writeStore: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("./sync-predictions", () => ({
  syncPredictionsToBackend: vi.fn(),
}));

import { readStore, writeStore } from "./store";
import { syncPredictionsToBackend } from "./sync-predictions";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "lead",
    score: 0.9,
    confidence: 0.9,
    summary: "Buying intent",
    suggestedAction: "Follow up",
    evidence: ["quote"],
    status: "new",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function store(signals: Signal[]): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [],
    messages: [],
    signals,
    pilot: { baselineOpportunities: 0 },
  };
}

describe("mergeSyncedBackendIds", () => {
  it("copies missing backendSignalId from the synced snapshot", () => {
    const latest = [signal()];
    const synced = [signal({ backendSignalId: "pred-1" })];
    expect(mergeSyncedBackendIds(latest, synced)[0]?.backendSignalId).toBe(
      "pred-1"
    );
  });

  it("heals a stale backendSignalId without clobbering feedback", () => {
    const latest = [
      signal({
        backendSignalId: "pred-stale",
        feedback: {
          label: "correct",
          reviewedAt: "2026-08-02T00:00:00.000Z",
        },
      }),
    ];
    const synced = [signal({ backendSignalId: "pred-live" })];
    const merged = mergeSyncedBackendIds(latest, synced);
    expect(merged[0]?.backendSignalId).toBe("pred-live");
    expect(merged[0]?.feedback?.label).toBe("correct");
  });

  it("returns the same array when nothing changed", () => {
    const latest = [signal({ backendSignalId: "pred-1" })];
    const synced = [signal({ backendSignalId: "pred-1" })];
    expect(mergeSyncedBackendIds(latest, synced)).toBe(latest);
  });
});

describe("persistDeferredPredictionSync", () => {
  beforeEach(() => {
    vi.mocked(readStore).mockReset();
    vi.mocked(writeStore).mockReset().mockResolvedValue(undefined);
    vi.mocked(syncPredictionsToBackend).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("upserts then writes only when new backendSignalIds landed", async () => {
    const before = store([signal()]);
    const afterSync = store([signal({ backendSignalId: "pred-1" })]);
    vi.mocked(readStore)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before);
    vi.mocked(syncPredictionsToBackend).mockResolvedValue({
      signals: afterSync.signals,
      sync: {
        attempted: 1,
        created: 1,
        updated: 0,
        failed: 0,
        skipped: 0,
      },
    });

    await persistDeferredPredictionSync("tenant_demo");

    expect(syncPredictionsToBackend).toHaveBeenCalledWith(
      before.signals,
      "tenant_demo"
    );
    expect(writeStore).toHaveBeenCalledWith(
      expect.objectContaining({
        signals: [expect.objectContaining({ backendSignalId: "pred-1" })],
      })
    );
  });

  it("skips POST when the tenant has no signals", async () => {
    vi.mocked(readStore).mockResolvedValue(store([]));

    await persistDeferredPredictionSync("tenant_demo");

    expect(syncPredictionsToBackend).not.toHaveBeenCalled();
    expect(writeStore).not.toHaveBeenCalled();
  });

  it("records the syncFailed banner when deferred dual-write fails", async () => {
    const before = store([
      signal(),
      signal({ id: "sig_2", conversationId: "conv_2" }),
    ]);
    const afterSync = store([
      signal({ backendSignalId: "pred-1" }),
      signal({ id: "sig_2", conversationId: "conv_2" }),
    ]);
    vi.mocked(readStore)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before);
    vi.mocked(syncPredictionsToBackend).mockResolvedValue({
      signals: afterSync.signals,
      sync: {
        attempted: 2,
        created: 1,
        updated: 0,
        failed: 1,
        skipped: 0,
      },
    });

    await persistDeferredPredictionSync("tenant_demo");

    const written = vi.mocked(writeStore).mock.calls[0]?.[0];
    expect(written?.predictionSyncFailure).toEqual({ failed: 1, created: 1 });
    expect(written?.signals[0]?.backendSignalId).toBe("pred-1");
    expect(written?.signals[1]?.backendSignalId).toBeUndefined();
  });

  it("clears the syncFailed banner when a later deferred sync succeeds", async () => {
    const before = store([signal({ backendSignalId: "pred-1" })]);
    before.predictionSyncFailure = { failed: 2, created: 0 };
    vi.mocked(readStore)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before);
    vi.mocked(syncPredictionsToBackend).mockResolvedValue({
      signals: before.signals,
      sync: {
        attempted: 1,
        created: 0,
        updated: 1,
        failed: 0,
        skipped: 0,
      },
    });

    await persistDeferredPredictionSync("tenant_demo");

    const written = vi.mocked(writeStore).mock.calls[0]?.[0];
    expect(written?.predictionSyncFailure).toBeUndefined();
    expect(written?.signals[0]?.backendSignalId).toBe("pred-1");
  });

  it("records the syncFailed banner when deferred dual-write throws", async () => {
    const before = store([signal()]);
    vi.mocked(readStore)
      .mockResolvedValueOnce(before)
      .mockResolvedValueOnce(before);
    vi.mocked(syncPredictionsToBackend).mockRejectedValue(
      new Error("backend down")
    );

    await expect(persistDeferredPredictionSync("tenant_demo")).rejects.toThrow(
      "backend down"
    );
    expect(writeStore).toHaveBeenCalledWith(
      expect.objectContaining({
        predictionSyncFailure: { failed: 1, created: 0 },
      })
    );
  });
});

describe("applyDeferredPredictionSyncResult", () => {
  it("leaves the snapshot alone when ids and the banner are unchanged", () => {
    const latest = store([signal({ backendSignalId: "pred-1" })]);
    latest.predictionSyncFailure = { failed: 1, created: 0 };
    expect(
      applyDeferredPredictionSyncResult(latest, latest.signals, {
        attempted: 1,
        created: 0,
        updated: 0,
        failed: 1,
        skipped: 0,
      })
    ).toBeNull();
  });
});
