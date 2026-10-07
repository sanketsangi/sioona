import type { LlmFailureKind } from "@/lib/detect-llm";
import { createInferenceId } from "../attempts";
import type { InferenceUsage } from "../types";
import { parseOpenAiCompatibleUsage, UNKNOWN_USAGE } from "../usage";

/** The only production host string for Groq. Tests may repeat it. */
export const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

export type GroqChatMessage = {
  role: "system" | "user";
  content: string;
};

type GroqCallMeta = {
  attemptId: string;
  model: string;
};

export type GroqChatSuccess = GroqCallMeta & {
  ok: true;
  httpStatus?: number;
  content: string;
  reasoning: string;
  usage: InferenceUsage;
  providerRequestId?: string;
};

export type GroqChatFailure = GroqCallMeta & {
  ok: false;
  reason: "timeout" | "network" | "malformed_json" | "http";
  httpStatus?: number;
  failureKind: LlmFailureKind | null;
  retryable: boolean;
  retryAfterMs: number | null;
  dailyQuota: boolean;
  usage: InferenceUsage;
  providerRequestId?: string;
};

export type GroqChatResult = GroqChatSuccess | GroqChatFailure;

/**
 * Map a Groq HTTP error onto key / model. Other statuses stay undiagnosed
 * so a 429 is not labeled as a bad response body.
 */
export function groqFailureKind(status: number, body: string): LlmFailureKind | null {
  const text = body.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    text.includes("invalid api key") ||
    text.includes("invalid_api_key") ||
    text.includes("expired_api_key")
  ) {
    return "key";
  }
  const modelGone =
    text.includes("does not exist") ||
    text.includes("decommission") ||
    text.includes("not found") ||
    text.includes("no longer") ||
    text.includes("deprecated") ||
    text.includes("model_not_found");
  if ((status === 400 || status === 404) && text.includes("model") && modelGone) {
    return "model";
  }
  if (status === 404 && text.includes("model")) return "model";
  return null;
}

/** Groq free-tier daily cap. The body names TPD; a short TPM 429 does not. */
export function isGroqDailyQuota(status: number, body: string): boolean {
  if (status !== 429) return false;
  return /tokens per day|\(tpd\)/i.test(body);
}

export function groqChatBody(model: string, messages: GroqChatMessage[]) {
  const qwen = /(^|\/)qwen/i.test(model);
  return {
    model,
    temperature: 0,
    ...(qwen
      ? { reasoning_effort: "none" as const, reasoning_format: "hidden" as const }
      : { reasoning_effort: "low" as const }),
    response_format: { type: "json_object" as const },
    messages,
  };
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const message = "message" in err ? String(err.message) : "";
  return /abort|timeout/i.test(message);
}

function responseHeader(response: Response, name: string): string | null {
  const headers = response.headers;
  if (!headers || typeof headers.get !== "function") return null;
  return headers.get(name);
}

export function retryAfterMs(response: Response): number | null {
  const raw = responseHeader(response, "retry-after");
  if (!raw) return null;
  const seconds = Number(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

function providerRequestId(response: Response): string | undefined {
  const value = responseHeader(response, "x-request-id")?.trim();
  return value || undefined;
}

function httpStatusOf(response: Response): number | undefined {
  return typeof response.status === "number" ? response.status : undefined;
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/**
 * One Groq chat completion using global `fetch` so existing test stubs apply.
 * Prompt text, classification parsing, pacing, and retry policy stay with the caller.
 */
export async function postGroqChatCompletion(input: {
  apiKey: string;
  model: string;
  messages: GroqChatMessage[];
  timeoutMs: number;
}): Promise<GroqChatResult> {
  const { signal, clear } = timeoutSignal(input.timeoutMs);
  const model = input.model;
  const attemptId = createInferenceId();
  let response: Response;
  try {
    response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(groqChatBody(model, input.messages)),
    });
  } catch (err) {
    const timeout = isAbortError(err);
    return {
      ok: false,
      reason: timeout ? "timeout" : "network",
      attemptId,
      model,
      failureKind: timeout ? "timeout" : null,
      retryable: true,
      retryAfterMs: null,
      dailyQuota: false,
      usage: UNKNOWN_USAGE,
    };
  } finally {
    clear();
  }

  const requestId = providerRequestId(response);
  const httpStatus = httpStatusOf(response);
  if (!response.ok) {
    let detail = "";
    try {
      detail = typeof response.text === "function" ? await response.text() : "";
    } catch {
      detail = "";
    }
    const dailyQuota = isGroqDailyQuota(response.status, detail);
    return {
      ok: false,
      reason: "http",
      attemptId,
      model,
      httpStatus,
      failureKind: dailyQuota ? "quota" : groqFailureKind(response.status, detail),
      retryable: !dailyQuota && (response.status === 429 || response.status >= 500),
      retryAfterMs: retryAfterMs(response),
      dailyQuota,
      usage: UNKNOWN_USAGE,
      ...(requestId ? { providerRequestId: requestId } : {}),
    };
  }

  let payload: {
    choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return {
      ok: false,
      reason: "malformed_json",
      attemptId,
      model,
      httpStatus,
      failureKind: "shape",
      retryable: false,
      retryAfterMs: null,
      dailyQuota: false,
      usage: UNKNOWN_USAGE,
      ...(requestId ? { providerRequestId: requestId } : {}),
    };
  }

  const message = payload.choices?.[0]?.message;
  return {
    ok: true,
    attemptId,
    model,
    httpStatus,
    content: typeof message?.content === "string" ? message.content : "",
    reasoning: typeof message?.reasoning === "string" ? message.reasoning : "",
    usage: parseOpenAiCompatibleUsage(payload),
    ...(requestId ? { providerRequestId: requestId } : {}),
  };
}
