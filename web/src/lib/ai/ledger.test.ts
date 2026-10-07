import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRunLedger,
  ledgerFlushFailureCount,
  resetLedgerFlushFailureCountForTests,
} from "./ledger";
import type { InferenceAttempt } from "./types";
import { UNKNOWN_USAGE } from "./usage";

vi.mock("@/lib/backend-client", () => ({
  preflightInferenceLedger: vi.fn(),
  flushInferenceAttempts: vi.fn(),
}));

import {
  flushInferenceAttempts,
  preflightInferenceLedger,
} from "@/lib/backend-client";

function sampleAttempt(id: string): InferenceAttempt {
  return {
    attemptId: id,
    logicalOperationId: "op_1",
    attemptOrdinal: 1,
    tenantId: "tenant_partner",
    stage: "detect",
    routeVersion: "detect:primary:qwen|off",
    provider: "groq",
    model: "qwen/qwen3.8-27b",
    promptVersion: "v2",
    startedAt: "2026-10-08T10:00:00.000Z",
    finishedAt: "2026-10-08T10:00:01.000Z",
    latencyMs: 1000,
    status: "succeeded",
    usage: UNKNOWN_USAGE,
  };
}

afterEach(() => {
  vi.clearAllMocks();
  resetLedgerFlushFailureCountForTests();
});

describe("createRunLedger", () => {
  it("preflight returns false when the ledger endpoint errors", async () => {
    vi.mocked(preflightInferenceLedger).mockRejectedValue(new Error("down"));
    const ledger = createRunLedger("tenant_partner");
    await expect(ledger.preflight()).resolves.toBe(false);
  });

  it("buffers attempts, attaches the run id, and flushes once", async () => {
    vi.mocked(preflightInferenceLedger).mockResolvedValue({ ok: true });
    vi.mocked(flushInferenceAttempts).mockResolvedValue({
      accepted: 1,
      inserted: 1,
      unchanged: 0,
    });
    const ledger = createRunLedger("tenant_partner");
    ledger.sink(sampleAttempt("att_1"));
    ledger.setDetectionRunId("run_abc");
    const result = await ledger.flush();
    expect(result).toEqual({ flushed: 1, failed: false });
    expect(flushInferenceAttempts).toHaveBeenCalledWith("tenant_partner", [
      expect.objectContaining({
        attemptId: "att_1",
        detectionRunId: "run_abc",
      }),
    ]);
    expect(ledger.size()).toBe(0);
  });

  it("increments the alertable metric after flush retries are exhausted", async () => {
    vi.mocked(flushInferenceAttempts).mockRejectedValue(new Error("timeout"));
    const ledger = createRunLedger("tenant_partner");
    ledger.sink(sampleAttempt("att_1"));
    const result = await ledger.flush();
    expect(result.failed).toBe(true);
    expect(flushInferenceAttempts).toHaveBeenCalledTimes(3);
    expect(ledgerFlushFailureCount()).toBe(1);
  });
});
