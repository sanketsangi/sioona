import type { LlmFailureKind } from "@/lib/detect-llm";

export type InferenceStage = "screen" | "detect" | "verify" | "action_draft" | "report";
export type UsageStatus = "reported" | "estimated" | "unknown";

export type InferenceUsage = {
  status: UsageStatus;
  inputTokens: number | null;
  /** Provider-reported subset of inputTokens. Never add it to inputTokens. */
  cachedInputTokens: number | null;
  outputTokens: number | null;
  /** May already be inside outputTokens. Never add it twice. */
  reasoningTokens: number | null;
};

export type InferenceAttempt = {
  attemptId: string;
  /** One classification of one conversation in one run. */
  logicalOperationId: string;
  /** 1-based across retries, fallback switches, and concurrent daily-quota recovery. */
  attemptOrdinal: number;
  tenantId: string;
  conversationId?: string;
  detectionRunId?: string;
  stage: InferenceStage;
  routeVersion: string;
  provider: "groq";
  model: string;
  promptVersion: string;
  startedAt: string;
  finishedAt: string;
  latencyMs: number;
  status: "succeeded" | "failed" | "timeout" | "cancelled";
  errorCategory?: LlmFailureKind | "network";
  httpStatus?: number;
  providerRequestId?: string;
  usage: InferenceUsage;
};

export type AttemptSink = (attempt: InferenceAttempt) => void;
