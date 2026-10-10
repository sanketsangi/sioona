import { createAttemptGuard } from "./budget";
/**
 * Production wrapper: preflight ledger → hybrid detect → attach run id → flush.
 * Every tenant uses heuristics-only when the ledger preflight fails (D2).
 */

import {
  runHybridDetection,
  type HybridDetectOptions,
  type HybridDetectResult,
} from "@/lib/detect-llm";
import { computeDetectionRunId } from "@/lib/sync-detection-run";
import type { Conversation, Message, TaxonomyOverrides } from "@/lib/types";
import { createRunLedger } from "./ledger";

export async function runHybridDetectionWithLedger(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  overrides?: TaxonomyOverrides | null,
  options?: Omit<HybridDetectOptions, "attemptSink" | "skipLlmReason">
): Promise<HybridDetectResult> {
  // Injectable classify paths (tests/eval) stay unmetered by design.
  if (options?.classify) {
    return runHybridDetection(
      conversations,
      messages,
      tenantId,
      overrides,
      options
    );
  }

  const ledger = createRunLedger(tenantId);
  const ready = await ledger.preflight();
  if (!ready) {
    return runHybridDetection(conversations, messages, tenantId, overrides, {
      ...options,
      skipLlmReason: "ledger",
    });
  }

  try {
    const result = await runHybridDetection(
      conversations,
      messages,
      tenantId,
      overrides,
      {
        ...options,
        attemptSink: ledger.sink,
        attemptGuard: createAttemptGuard(tenantId),
      }
    );
    const runId = computeDetectionRunId({
      conversations,
      messages,
      signals: result.signals,
      skippedIds: result.llm.skippedIds,
      contexts: result.llm.contexts,
    });
    ledger.setDetectionRunId(runId);
    return result;
  } finally {
    await ledger.flush();
  }
}
