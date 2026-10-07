/**
 * Production wrapper: preflight ledger → hybrid detect → attach run id → flush.
 * Demo tenant may run without FastAPI (showcase warm); partner tenants fail soft
 * to heuristics-only when the ledger preflight fails (D2).
 */

import {
  runHybridDetection,
  type HybridDetectOptions,
  type HybridDetectResult,
} from "@/lib/detect-llm";
import { DEMO_TENANT_ID } from "@/lib/tenant-context";
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
    if (tenantId === DEMO_TENANT_ID) {
      return runHybridDetection(
        conversations,
        messages,
        tenantId,
        overrides,
        options
      );
    }
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
