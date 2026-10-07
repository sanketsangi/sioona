import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/backend-client", () => ({
  getInferenceUsage: vi.fn(),
  postInferenceAttempts: vi.fn(),
}));

import { getInferenceUsage, postInferenceAttempts } from "@/lib/backend-client";
import {
  LEDGER_FLUSH_CHUNK,
  chunkLedgerAttempts,
  flushLedgerAttempts,
  flushLedgerBatch,
  openDetectionLedger,
} from "./ledger";
import type { InferenceAttempt } from "./types";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("flushLedgerBatch", () => {
  it("retries three times and logs only the count", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const post = vi.fn().mockRejectedValue(new Error("down"));
    const row = { attempt_id: "a", logical_operation_id: "o", attempt_ordinal: 1, stage: "detect" as const,
      route_version: "r", provider: "groq" as const, model: "m", prompt_version: "p", status: "timeout" as const,
      usage_status: "unknown" as const, started_at: "2026-10-08T00:00:00Z", finished_at: "2026-10-08T00:00:01Z" };
    await expect(flushLedgerBatch([row], post)).resolves.toBe(false);
    expect(post).toHaveBeenCalledTimes(3);
    expect(warn).toHaveBeenCalledWith("sioona.inference_ledger.flush_failed count=1");
    expect(warn.mock.calls[0]?.[0]).not.toContain("transcript");
    warn.mockRestore();
  });

  it("chunks flushes at the API max of 500", async () => {
    const post = vi.fn().mockResolvedValue(undefined);
    const rows = Array.from({ length: LEDGER_FLUSH_CHUNK + 2 }, (_, index) => ({
      attempt_id: `a${index}`,
      logical_operation_id: "o",
      attempt_ordinal: 1,
      stage: "detect" as const,
      route_version: "r",
      provider: "groq" as const,
      model: "m",
      prompt_version: "p",
      status: "timeout" as const,
      usage_status: "unknown" as const,
      started_at: "2026-10-08T00:00:00Z",
      finished_at: "2026-10-08T00:00:01Z",
    }));
    expect(chunkLedgerAttempts(rows)).toHaveLength(2);
    expect(chunkLedgerAttempts(rows)[0]).toHaveLength(LEDGER_FLUSH_CHUNK);
    expect(chunkLedgerAttempts(rows)[1]).toHaveLength(2);
    await expect(flushLedgerAttempts(rows, post)).resolves.toBe(true);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0]?.[0]).toHaveLength(LEDGER_FLUSH_CHUNK);
    expect(post.mock.calls[1]?.[0]).toHaveLength(2);
  });
});

describe("openDetectionLedger", () => {
  it("skips the LLM when the ledger preflight is unreachable", async () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.mocked(getInferenceUsage).mockRejectedValue(new Error("down"));
    const ledger = await openDetectionLedger("tenant_demo");
    expect(ledger.ready).toBe(false);
    expect(ledger.detectOptions.skipLlm).toBe(true);
    expect(ledger.detectOptions.attemptSink).toBeUndefined();
  });

  it("buffers attempts and stamps the detection run before flush", async () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "test-key");
    vi.mocked(getInferenceUsage).mockResolvedValue({ tenant_id: "tenant_demo", groups: [] });
    vi.mocked(postInferenceAttempts).mockResolvedValue({ inserted: 1, replayed: 0 });
    const ledger = await openDetectionLedger("tenant_demo");
    const attempt: InferenceAttempt = {
      attemptId: "a1",
      logicalOperationId: "op",
      attemptOrdinal: 1,
      tenantId: "tenant_demo",
      conversationId: "conv",
      stage: "detect",
      routeVersion: "detect:primary:test|off",
      provider: "groq",
      model: "m",
      promptVersion: "p",
      startedAt: "2026-10-08T00:00:00Z",
      finishedAt: "2026-10-08T00:00:01Z",
      latencyMs: 5,
      status: "succeeded",
      usage: { status: "reported", inputTokens: 3, cachedInputTokens: null, outputTokens: 1, reasoningTokens: null },
    };
    ledger.detectOptions.attemptSink?.(attempt);
    ledger.setDetectionRunId("run-1");
    await ledger.flush();
    expect(postInferenceAttempts).toHaveBeenCalledWith("tenant_demo", [
      expect.objectContaining({ attempt_id: "a1", detection_run_id: "run-1", input_tokens: 3 }),
    ]);
    const body = JSON.stringify(vi.mocked(postInferenceAttempts).mock.calls[0]?.[1]);
    expect(body).not.toContain("quote");
    expect(body).not.toContain("transcript");
  });

  it("does not preflight when detection is heuristics only", async () => {
    vi.stubEnv("DETECT_LLM", "");
    const ledger = await openDetectionLedger("tenant_demo");
    expect(ledger.ready).toBe(true);
    expect(ledger.detectOptions.attemptSink).toBeUndefined();
    expect(getInferenceUsage).not.toHaveBeenCalled();
  });
});
