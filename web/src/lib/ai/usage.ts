import type { InferenceUsage } from "./types";

const count = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export const UNKNOWN_USAGE: InferenceUsage = {
  status: "unknown",
  inputTokens: null,
  cachedInputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
};

/**
 * OpenAI-compatible Chat Completions `usage`.
 * Groq fields: `prompt_tokens`, `completion_tokens`,
 * `prompt_tokens_details.cached_tokens`, `completion_tokens_details.reasoning_tokens`.
 * Absent or invalid counts stay null. Missing prompt or completion counts keep
 * `status: "unknown"` and are never stored as zero.
 */
export function parseOpenAiCompatibleUsage(payload: unknown): InferenceUsage {
  const usage = (payload as { usage?: Record<string, unknown> } | null)?.usage;
  if (!usage || typeof usage !== "object") return UNKNOWN_USAGE;
  const prompt = usage.prompt_tokens_details as Record<string, unknown> | undefined;
  const completion = usage.completion_tokens_details as Record<string, unknown> | undefined;
  const parsed: InferenceUsage = {
    status: "reported",
    inputTokens: count(usage.prompt_tokens),
    cachedInputTokens: count(prompt?.cached_tokens),
    outputTokens: count(usage.completion_tokens),
    reasoningTokens: count(completion?.reasoning_tokens),
  };
  return parsed.inputTokens === null || parsed.outputTokens === null
    ? { ...parsed, status: "unknown" }
    : parsed;
}
