import { getInferenceUsage, postInferenceAttempts, type BackendInferenceAttempt } from "@/lib/backend-client";
import type { HybridDetectOptions } from "@/lib/detect-llm";
import type { AttemptSink, InferenceAttempt } from "./types";

const FLUSH_ATTEMPTS = 3;
/** Matches `InferenceAttemptBatch` max_length on the FastAPI route. */
export const LEDGER_FLUSH_CHUNK = 500;

function detectionUsesLlm(): boolean {
  return process.env.DETECT_LLM === "1" && Boolean(process.env.GROQ_API_KEY?.trim());
}

export type DetectionLedger = {
  ready: boolean;
  detectOptions: Pick<HybridDetectOptions, "attemptSink" | "skipLlm">;
  setDetectionRunId: (runId: string) => void;
  flush: () => Promise<void>;
};

/** Split a buffered run into API-sized chunks (≤500). */
export function chunkLedgerAttempts<T>(rows: T[], size = LEDGER_FLUSH_CHUNK): T[][] {
  if (size < 1) throw new Error("ledger chunk size must be positive");
  if (!rows.length) return [];
  const chunks: T[][] = [];
  for (let offset = 0; offset < rows.length; offset += size) {
    chunks.push(rows.slice(offset, offset + size));
  }
  return chunks;
}

/** Retry one chunk. Logs a count only when every try fails. */
export async function flushLedgerBatch(
  rows: BackendInferenceAttempt[],
  post: (rows: BackendInferenceAttempt[]) => Promise<void>,
): Promise<boolean> {
  if (!rows.length) return true;
  for (let attempt = 0; attempt < FLUSH_ATTEMPTS; attempt += 1) {
    try {
      await post(rows);
      return true;
    } catch {
      // The next try is the same chunk. Attempt text stays out of the log.
    }
  }
  console.warn(`sioona.inference_ledger.flush_failed count=${rows.length}`);
  return false;
}

/** Flush every chunk. A failed chunk does not block later chunks. */
export async function flushLedgerAttempts(
  rows: BackendInferenceAttempt[],
  post: (rows: BackendInferenceAttempt[]) => Promise<void>,
): Promise<boolean> {
  let ok = true;
  for (const chunk of chunkLedgerAttempts(rows)) {
    if (!(await flushLedgerBatch(chunk, post))) ok = false;
  }
  return ok;
}

function toWire(attempt: InferenceAttempt): BackendInferenceAttempt {
  return {
    attempt_id: attempt.attemptId,
    logical_operation_id: attempt.logicalOperationId,
    attempt_ordinal: attempt.attemptOrdinal,
    ...(attempt.conversationId ? { conversation_id: attempt.conversationId } : {}),
    ...(attempt.detectionRunId ? { detection_run_id: attempt.detectionRunId } : {}),
    stage: attempt.stage,
    route_version: attempt.routeVersion,
    provider: attempt.provider,
    model: attempt.model,
    prompt_version: attempt.promptVersion,
    status: attempt.status,
    ...(attempt.errorCategory ? { error_category: attempt.errorCategory } : {}),
    ...(attempt.httpStatus != null ? { http_status: attempt.httpStatus } : {}),
    ...(attempt.providerRequestId ? { provider_request_id: attempt.providerRequestId } : {}),
    usage_status: attempt.usage.status,
    ...(attempt.usage.status !== "unknown" && attempt.usage.inputTokens != null
      ? { input_tokens: attempt.usage.inputTokens } : {}),
    ...(attempt.usage.status !== "unknown" && attempt.usage.cachedInputTokens != null
      ? { cached_input_tokens: attempt.usage.cachedInputTokens } : {}),
    ...(attempt.usage.status !== "unknown" && attempt.usage.outputTokens != null
      ? { output_tokens: attempt.usage.outputTokens } : {}),
    ...(attempt.usage.status !== "unknown" && attempt.usage.reasoningTokens != null
      ? { reasoning_tokens: attempt.usage.reasoningTokens } : {}),
    latency_ms: attempt.latencyMs,
    started_at: attempt.startedAt,
    finished_at: attempt.finishedAt,
  };
}

const idleLedger: DetectionLedger = {
  ready: true,
  detectOptions: {},
  setDetectionRunId: () => undefined,
  flush: async () => undefined,
};

export async function openDetectionLedger(
  tenantId: string,
  options?: { classifyInjected?: boolean },
): Promise<DetectionLedger> {
  if (options?.classifyInjected || !detectionUsesLlm()) return idleLedger;
  let ready = false;
  try {
    const now = new Date().toISOString();
    await getInferenceUsage(tenantId, { from: now, to: now, groupBy: "day" });
    ready = true;
  } catch {
    ready = false;
  }
  if (!ready) {
    return {
      ready: false,
      detectOptions: { skipLlm: true },
      setDetectionRunId: () => undefined,
      flush: async () => undefined,
    };
  }
  const rows: InferenceAttempt[] = [];
  let runId: string | undefined;
  const sink: AttemptSink = (attempt) => {
    rows.push({ ...attempt, detectionRunId: runId ?? attempt.detectionRunId });
  };
  return {
    ready: true,
    detectOptions: { attemptSink: sink },
    setDetectionRunId(id: string) {
      runId = id;
      for (const row of rows) row.detectionRunId = id;
    },
    async flush() {
      if (!rows.length) return;
      const batch = rows.map(toWire);
      rows.length = 0;
      await flushLedgerAttempts(batch, (attempts) =>
        postInferenceAttempts(tenantId, attempts).then(() => undefined),
      );
    },
  };
}

export async function withDetectionLedger<T>(
  tenantId: string,
  run: (ledger: DetectionLedger) => Promise<T>,
  options?: { classifyInjected?: boolean },
): Promise<T> {
  const ledger = await openDetectionLedger(tenantId, options);
  try {
    return await run(ledger);
  } finally {
    await ledger.flush();
  }
}
