import { describe, expect, it, vi } from "vitest";
import { createInferenceId, noopAttemptSink } from "./attempts";
import type { InferenceAttempt } from "./types";
import { UNKNOWN_USAGE } from "./usage";

const attempt: InferenceAttempt = {
  attemptId: "attempt",
  logicalOperationId: "operation",
  attemptOrdinal: 1,
  tenantId: "tenant_demo",
  stage: "detect",
  routeVersion: "detect:primary:model|fallback",
  provider: "groq",
  model: "qwen/qwen3.8-27b",
  promptVersion: "prompt",
  startedAt: "2026-10-08T00:00:00.000Z",
  finishedAt: "2026-10-08T00:00:01.000Z",
  latencyMs: 1000,
  status: "succeeded",
  usage: UNKNOWN_USAGE,
};

describe("attempt contracts", () => {
  it("ignores events from the shared no-op sink", () => {
    expect(noopAttemptSink(attempt)).toBeUndefined();
  });

  it("creates unique UUID attempt ids", () => {
    const ids = new Set(Array.from({ length: 20 }, () => createInferenceId()));
    expect(ids.size).toBe(20);
    for (const id of ids) {
      expect(id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    }
  });

  it("does not require the no-op sink to persist or throw", () => {
    const sink = vi.fn(noopAttemptSink);
    sink(attempt);
    sink({ ...attempt, status: "failed", errorCategory: "quota", usage: UNKNOWN_USAGE });
    expect(sink).toHaveBeenCalledTimes(2);
  });
});
