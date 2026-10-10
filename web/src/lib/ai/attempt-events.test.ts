import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLlmPrimaryPass,
  classifyConversationWithGroq,
  DEFAULT_DETECT_LLM_MODEL,
  DETECT_PROMPT_VERSION,
  detectRouteVersion,
  FALLBACK_DETECT_LLM_MODEL,
  resetGroqPaceForTests,
} from "@/lib/detect-llm";
import * as groq from "@/lib/ai/providers/groq";
import type { InferenceAttempt } from "./types";
import type { Conversation, Message } from "@/lib/types";

function conversation(id: string): Conversation {
  return {
    id,
    tenantId: "tenant_demo",
    channel: "whatsapp",
    customerName: "Customer abcd1234",
    startedAt: "2026-08-01T00:00:00.000Z",
    messageIds: [`${id}_m`],
  };
}

function customerMessages(id: string): Message[] {
  return [
    {
      id: `${id}_m`,
      conversationId: id,
      role: "customer",
      content: "I am closing my account and moving my portfolio.",
      timestamp: "2026-08-01T00:00:00.000Z",
    },
  ];
}

const okBody = {
  choices: [
    {
      message: {
        content: JSON.stringify({
          signal: "retention_risk",
          confidence: 0.9,
          evidence: "I am closing my account",
          reason: "Customer will leave.",
        }),
      },
    },
  ],
};

function okResponse() {
  return { ok: true, status: 200, json: async () => okBody };
}

function quotaResponse() {
  return {
    ok: false,
    status: 429,
    text: async () => "Rate limit reached on tokens per day (TPD): Limit 200000, Used 200000.",
  };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
  resetGroqPaceForTests();
});

function enableGroq() {
  vi.stubEnv("GROQ_API_KEY", "gsk_test");
  vi.stubEnv("DETECT_LLM", "1");
  vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
  vi.stubEnv("DETECT_LLM_MODEL", DEFAULT_DETECT_LLM_MODEL);
  vi.stubEnv("DETECT_LLM_FALLBACK_MODEL", FALLBACK_DETECT_LLM_MODEL);
  vi.stubEnv("DETECT_LLM_PRIMARY", "1");
}

function ordinals(events: InferenceAttempt[]): Record<string, number[]> {
  const grouped: Record<string, number[]> = {};
  for (const event of events) {
    grouped[event.logicalOperationId] ??= [];
    grouped[event.logicalOperationId].push(event.attemptOrdinal);
  }
  return grouped;
}

describe("provider attempt events", () => {
  it("emits one event for a successful call and leaves missing usage unknown", async () => {
    enableGroq();
    const events: InferenceAttempt[] = [];
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    const result = await applyLlmPrimaryPass(
      [conversation("conv_ok")],
      customerMessages("conv_ok"),
      "tenant_demo",
      [],
      null,
      { attemptSink: (event) => events.push(event), maxCalls: 1 }
    );
    expect(result.llm.added).toBe(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      attemptOrdinal: 1,
      tenantId: "tenant_demo",
      conversationId: "conv_ok",
      stage: "detect",
      provider: "groq",
      model: DEFAULT_DETECT_LLM_MODEL,
      promptVersion: DETECT_PROMPT_VERSION,
      routeVersion: detectRouteVersion(),
      status: "succeeded",
      httpStatus: 200,
      usage: {
        status: "unknown",
        inputTokens: null,
        cachedInputTokens: null,
        outputTokens: null,
        reasoningTokens: null,
      },
    });
    expect(events[0].attemptId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(events[0].latencyMs).toBeGreaterThanOrEqual(0);
    expect(events[0].errorCategory).toBeUndefined();
    expect(result.signals[0]?.detectionContext).toMatchObject({
      model: DEFAULT_DETECT_LLM_MODEL,
      promptVersion: DETECT_PROMPT_VERSION,
      stage: "detect",
      routeVersion: events[0].routeVersion,
    });
  });

  it("meters the admission id when the provider throws before returning", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "1");
    const events: InferenceAttempt[] = [];
    let admitted: string | undefined;
    vi.spyOn(groq, "postGroqChatCompletion").mockImplementation(async (input) => {
      admitted = input.attemptId;
      throw new Error("provider exploded");
    });
    await expect(
      classifyConversationWithGroq(
        {
          conversation: conversation("conv_provider_throw"),
          customerMessages: customerMessages("conv_provider_throw"),
        },
        undefined,
        { attemptSink: (event) => events.push(event), tenantId: "tenant_demo" }
      )
    ).rejects.toThrow("provider exploded");
    expect(admitted).toBeTruthy();
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      attemptId: admitted,
      attemptOrdinal: 1,
      status: "failed",
      errorCategory: "network",
      logicalOperationId: expect.any(String),
    });
  });

  it("emits one event per retry, including the successful fetch", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "2");
    const events: InferenceAttempt[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 429, text: async () => "rate limit" })
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await classifyConversationWithGroq(
      { conversation: conversation("conv_retry"), customerMessages: customerMessages("conv_retry") },
      undefined,
      { attemptSink: (event) => events.push(event), tenantId: "tenant_demo" }
    );
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events.map((event) => event.status)).toEqual(["failed", "succeeded"]);
    expect(events.map((event) => event.attemptOrdinal)).toEqual([1, 2]);
    expect(new Set(events.map((event) => event.attemptId)).size).toBe(2);
    expect(new Set(events.map((event) => event.logicalOperationId)).size).toBe(1);
    expect(events[0].httpStatus).toBe(429);
    expect(events[0].errorCategory).toBeUndefined();
  });

  it("does not let a throwing attemptSink replace a shape failure", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "1");
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "not-json" } }] }),
      })
    );
    const input = {
      conversation: conversation("conv_sink_shape"),
      customerMessages: customerMessages("conv_sink_shape"),
    };
    const baseline: InferenceAttempt[] = [];
    await expect(
      classifyConversationWithGroq(input, undefined, {
        attemptSink: (event) => baseline.push(event),
      })
    ).rejects.toMatchObject({ kind: "shape", name: "LlmCallFailed" });
    expect(baseline).toHaveLength(1);

    await expect(
      classifyConversationWithGroq(input, undefined, {
        attemptSink: () => {
          throw new Error("sink down");
        },
      })
    ).rejects.toMatchObject({ kind: "shape", name: "LlmCallFailed" });
  });

  it("does not let a throwing attemptSink hide a successful classification", async () => {
    enableGroq();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(okResponse()));
    await expect(
      classifyConversationWithGroq(
        {
          conversation: conversation("conv_sink_ok"),
          customerMessages: customerMessages("conv_sink_ok"),
        },
        undefined,
        {
          attemptSink: () => {
            throw new Error("sink down");
          },
        }
      )
    ).resolves.toMatchObject({ type: "retention" });
  });

  it("emits one shape event when the provider response is not a classification", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "1");
    const events: InferenceAttempt[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: "not-json" } }] }),
      })
    );
    await expect(
      classifyConversationWithGroq(
        { conversation: conversation("conv_shape"), customerMessages: customerMessages("conv_shape") },
        undefined,
        { attemptSink: (event) => events.push(event) }
      )
    ).rejects.toMatchObject({ kind: "shape" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "failed",
      errorCategory: "shape",
      httpStatus: 200,
      usage: { status: "unknown", inputTokens: null, outputTokens: null },
    });
  });

  it("emits one timeout event when the fetch aborts", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "1");
    const events: InferenceAttempt[] = [];
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("aborted")));
    await expect(
      classifyConversationWithGroq(
        { conversation: conversation("conv_timeout"), customerMessages: customerMessages("conv_timeout") },
        undefined,
        { attemptSink: (event) => events.push(event) }
      )
    ).rejects.toMatchObject({ kind: "timeout" });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ status: "timeout", errorCategory: "timeout", attemptOrdinal: 1 });
    expect(events[0].httpStatus).toBeUndefined();
    expect(events[0].usage.status).toBe("unknown");
  });

  it("counts the daily-quota fallback as its own attempt and does not zero-fill usage", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "2");
    const events: InferenceAttempt[] = [];
    const fetchMock = vi.fn().mockResolvedValueOnce(quotaResponse()).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        ...okBody,
        usage: {
          prompt_tokens: 20,
          completion_tokens: 5,
          prompt_tokens_details: { cached_tokens: 7 },
          completion_tokens_details: { reasoning_tokens: 1 },
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await classifyConversationWithGroq(
      { conversation: conversation("conv_quota"), customerMessages: customerMessages("conv_quota") },
      undefined,
      { attemptSink: (event) => events.push(event) }
    );
    expect(result?.context?.model).toBe(FALLBACK_DETECT_LLM_MODEL);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      attemptOrdinal: 1,
      model: DEFAULT_DETECT_LLM_MODEL,
      status: "failed",
      errorCategory: "quota",
      usage: { status: "unknown", inputTokens: null, outputTokens: null },
    });
    expect(events[1]).toMatchObject({
      attemptOrdinal: 2,
      model: FALLBACK_DETECT_LLM_MODEL,
      status: "succeeded",
      logicalOperationId: events[0].logicalOperationId,
      usage: {
        status: "reported",
        inputTokens: 20,
        cachedInputTokens: 7,
        outputTokens: 5,
        reasoningTokens: 1,
      },
    });
    expect(events[0].attemptId).not.toBe(events[1].attemptId);
  });

  it("emits only the failed quota event when fallback is disabled", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_FALLBACK_MODEL", "0");
    const events: InferenceAttempt[] = [];
    const fetchMock = vi.fn().mockResolvedValue(quotaResponse());
    vi.stubGlobal("fetch", fetchMock);
    await expect(
      classifyConversationWithGroq(
        { conversation: conversation("conv_nofallback"), customerMessages: customerMessages("conv_nofallback") },
        undefined,
        { attemptSink: (event) => events.push(event) }
      )
    ).rejects.toMatchObject({ kind: "quota", dailyQuota: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "failed",
      errorCategory: "quota",
      model: DEFAULT_DETECT_LLM_MODEL,
      routeVersion: `detect:primary:${DEFAULT_DETECT_LLM_MODEL}|off`,
    });
    expect(detectRouteVersion()).toBe(events[0].routeVersion);
  });

  it("gives every concurrent fallback fetch its own id and ordinal", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "3");
    const events: InferenceAttempt[] = [];
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const { model } = JSON.parse(String(init.body)) as { model: string };
      if (model === DEFAULT_DETECT_LLM_MODEL) return quotaResponse();
      return okResponse();
    });
    vi.stubGlobal("fetch", fetchMock);
    const ids = ["conv_race_a", "conv_race_b"];
    const { llm } = await applyLlmPrimaryPass(
      ids.map(conversation),
      ids.flatMap(customerMessages),
      "tenant_demo",
      [],
      null,
      { attemptSink: (event) => events.push(event), concurrency: 2, maxCalls: 2 }
    );
    expect(llm.failed).toBe(0);
    expect(events).toHaveLength(fetchMock.mock.calls.length);
    expect(new Set(events.map((event) => event.attemptId)).size).toBe(events.length);
    const byOperation = ordinals(events);
    expect(Object.keys(byOperation)).toHaveLength(2);
    for (const sequence of Object.values(byOperation)) {
      expect(sequence).toEqual(sequence.map((_, index) => index + 1));
    }
    expect(events.some((event) => event.model === FALLBACK_DETECT_LLM_MODEL && event.status === "succeeded")).toBe(
      true
    );
    expect(events.some((event) => event.errorCategory === "quota")).toBe(true);
  });

  it("refuses a Retry-After above the local cap and retries inside it", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "3");
    const over: InferenceAttempt[] = [];
    const overFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "21" : null) },
      text: async () => "unavailable",
    });
    vi.stubGlobal("fetch", overFetch);
    await expect(
      classifyConversationWithGroq(
        { conversation: conversation("conv_cap"), customerMessages: customerMessages("conv_cap") },
        undefined,
        { attemptSink: (event) => over.push(event) }
      )
    ).rejects.toMatchObject({ retryable: true });
    expect(overFetch).toHaveBeenCalledTimes(1);
    expect(over).toHaveLength(1);

    const within: InferenceAttempt[] = [];
    const withinFetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        headers: { get: (name: string) => (name.toLowerCase() === "retry-after" ? "0.2" : null) },
        text: async () => "rate limit",
      })
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", withinFetch);
    await classifyConversationWithGroq(
      { conversation: conversation("conv_within"), customerMessages: customerMessages("conv_within") },
      undefined,
      { attemptSink: (event) => within.push(event) }
    );
    expect(withinFetch).toHaveBeenCalledTimes(2);
    expect(within.map((event) => event.attemptOrdinal)).toEqual([1, 2]);
  });

  it("uses exponential backoff when Retry-After is absent", async () => {
    enableGroq();
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "3");
    const sleeps: number[] = [];
    const realSetTimeout = globalThis.setTimeout;
    vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: TimerHandler, ms?: number) => {
      if (typeof fn === "function" && ms === 200) {
        sleeps.push(ms);
        fn();
        return 0 as unknown as ReturnType<typeof setTimeout>;
      }
      return realSetTimeout(fn, ms);
    }) as typeof setTimeout);
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({ ok: false, status: 500, text: async () => "unavailable" })
      .mockResolvedValueOnce(okResponse());
    vi.stubGlobal("fetch", fetchMock);
    await classifyConversationWithGroq(
      { conversation: conversation("conv_backoff"), customerMessages: customerMessages("conv_backoff") }
    );
    expect(sleeps).toEqual([200]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("describes miss-only mode in the route version", () => {
    vi.stubEnv("DETECT_LLM_PRIMARY", "0");
    vi.stubEnv("DETECT_LLM_MODEL", "qwen/qwen3.8-27b");
    vi.stubEnv("DETECT_LLM_FALLBACK_MODEL", "openai/gpt-oss-20b");
    expect(detectRouteVersion()).toBe("detect:miss-only:qwen/qwen3.8-27b|openai/gpt-oss-20b");
  });
});
