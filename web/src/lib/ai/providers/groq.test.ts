import { afterEach, describe, expect, it, vi } from "vitest";
import { DETECT_LLM_TIMEOUT_MS } from "@/lib/detect-llm";
import {
  GROQ_CHAT_URL,
  groqChatBody,
  groqFailureKind,
  isGroqDailyQuota,
  postGroqChatCompletion,
  retryAfterMs,
} from "./groq";

const messages = [{ role: "user" as const, content: "I am closing my account" }];

function headers(values: Record<string, string>): { get: (name: string) => string | null } {
  return {
    get(name: string) {
      return values[name.toLowerCase()] ?? null;
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("groq adapter", () => {
  it("sends the Qwen and non-Qwen request bodies unchanged", () => {
    expect(groqChatBody("qwen/qwen3.8-27b", messages)).toEqual({
      model: "qwen/qwen3.8-27b",
      temperature: 0,
      reasoning_effort: "none",
      reasoning_format: "hidden",
      response_format: { type: "json_object" },
      messages,
    });
    expect(groqChatBody("openai/gpt-oss-20b", messages)).toEqual({
      model: "openai/gpt-oss-20b",
      temperature: 0,
      reasoning_effort: "low",
      response_format: { type: "json_object" },
      messages,
    });
    expect(JSON.stringify(groqChatBody("Org/Qwen-test", messages))).toContain(
      '"reasoning_format":"hidden"'
    );
  });

  it("posts those bytes to global fetch with the bearer token", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: headers({ "x-request-id": "req_123" }),
      json: async () => ({
        usage: { prompt_tokens: 11, completion_tokens: 4 },
        choices: [
          {
            message: {
              content: "",
              reasoning: "{\"signal\":\"none\"}",
            },
          },
        ],
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await postGroqChatCompletion({
      apiKey: "gsk_test",
      model: "qwen/qwen3.8-27b",
      messages,
      timeoutMs: DETECT_LLM_TIMEOUT_MS,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][0]).toBe(GROQ_CHAT_URL);
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      "Content-Type": "application/json",
      Authorization: "Bearer gsk_test",
    });
    expect(JSON.parse(String(init.body))).toEqual(groqChatBody("qwen/qwen3.8-27b", messages));
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(result).toMatchObject({
      ok: true,
      model: "qwen/qwen3.8-27b",
      content: "",
      reasoning: "{\"signal\":\"none\"}",
      httpStatus: 200,
      providerRequestId: "req_123",
      usage: {
        status: "reported",
        inputTokens: 11,
        outputTokens: 4,
        cachedInputTokens: null,
        reasoningTokens: null,
      },
    });
    expect(result.attemptId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );
  });

  it("aborts the global fetch at the 6 second detect timeout", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => {
      return new Promise((_resolve, reject) => {
        init.signal?.addEventListener("abort", () => {
          const error = new Error("The operation was aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const pending = postGroqChatCompletion({
      apiKey: "gsk_test",
      model: "qwen/qwen3.8-27b",
      messages,
      timeoutMs: DETECT_LLM_TIMEOUT_MS,
    });
    await vi.advanceTimersByTimeAsync(DETECT_LLM_TIMEOUT_MS - 1);
    let settled = false;
    void pending.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      }
    );
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    await expect(pending).resolves.toMatchObject({
      ok: false,
      reason: "timeout",
      failureKind: "timeout",
      retryable: true,
      usage: { status: "unknown", inputTokens: null, outputTokens: null },
    });
  });

  it("maps malformed JSON, HTTP failures, daily quota, and Retry-After", async () => {
    expect(groqFailureKind(401, "invalid api key")).toBe("key");
    expect(groqFailureKind(400, "The model `qwen` does not exist")).toBe("model");
    expect(groqFailureKind(429, "rate limit")).toBeNull();
    expect(isGroqDailyQuota(429, "tokens per day (TPD): Limit 1")).toBe(true);
    expect(isGroqDailyQuota(429, "tokens per minute (TPM): Limit 8000")).toBe(false);
    expect(retryAfterMs({ headers: headers({ "retry-after": "1.5" }) } as Response)).toBe(1500);
    expect(retryAfterMs({ headers: headers({ "retry-after": "21" }) } as Response)).toBe(21_000);
    expect(retryAfterMs({ headers: headers({ "retry-after": "-1" }) } as Response)).toBeNull();
    expect(retryAfterMs({ headers: headers({}) } as Response)).toBeNull();
    expect(retryAfterMs({} as Response)).toBeNull();

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => {
          throw new SyntaxError("bad json");
        },
      })
    );
    await expect(
      postGroqChatCompletion({
        apiKey: "gsk_test",
        model: "openai/gpt-oss-20b",
        messages,
        timeoutMs: 6000,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "malformed_json",
      failureKind: "shape",
      retryable: false,
      usage: { status: "unknown", inputTokens: null, outputTokens: null },
    });

    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        headers: headers({ "retry-after": "2", "x-request-id": "req_quota" }),
        text: async () => "Rate limit reached on tokens per day (TPD): Limit 200000",
      })
    );
    await expect(
      postGroqChatCompletion({
        apiKey: "gsk_test",
        model: "qwen/qwen3.8-27b",
        messages,
        timeoutMs: 6000,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "http",
      httpStatus: 429,
      failureKind: "quota",
      retryable: false,
      dailyQuota: true,
      retryAfterMs: 2000,
      providerRequestId: "req_quota",
      usage: { status: "unknown", cachedInputTokens: null, reasoningTokens: null },
    });

    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("socket closed")));
    await expect(
      postGroqChatCompletion({
        apiKey: "gsk_test",
        model: "qwen/qwen3.8-27b",
        messages,
        timeoutMs: 6000,
      })
    ).resolves.toMatchObject({
      ok: false,
      reason: "network",
      failureKind: null,
      retryable: true,
      usage: { status: "unknown" },
    });
  });
});
