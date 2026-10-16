/**
 * CB-06 buffered AttemptSink (D2): preflight before LLM, flush in finally.
 * Never logs prompt or transcript text. Crash before flush can lose the buffer
 * (known gap closed by CB-11 pending-before-provider writes).
 */

import {
  flushInferenceAttempts,
  reportLedgerFlushFailure,
  preflightInferenceLedger,
} from "@/lib/backend-client";
import type { AttemptSink, InferenceAttempt } from "./types";

export const LEDGER_FLUSH_MAX_ATTEMPTS = 3;
export const LEDGER_BATCH_LIMIT = 500;

export type RunLedger = {
  sink: AttemptSink;
  preflight: () => Promise<boolean>;
  setDetectionRunId: (runId: string | undefined) => void;
  flush: () => Promise<{ flushed: number; failed: boolean }>;
  size: () => number;
};

export type LedgerFlushMetric = {
  tenantId: string;
  buffered: number;
  flushed: number;
  failed: boolean;
};

let flushFailureMetric = 0;

/** Alertable counter for CB-15 — increments when a flush exhausts retries. */
export function ledgerFlushFailureCount(): number {
  return flushFailureMetric;
}

export function resetLedgerFlushFailureCountForTests(): void {
  flushFailureMetric = 0;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function createRunLedger(tenantId: string): RunLedger {
  const buffer: InferenceAttempt[] = [];
  let detectionRunId: string | undefined;

  const sink: AttemptSink = (attempt) => {
    buffer.push(
      detectionRunId && !attempt.detectionRunId
        ? { ...attempt, detectionRunId }
        : attempt
    );
  };

  return {
    sink,
    size: () => buffer.length,
    setDetectionRunId: (runId) => {
      detectionRunId = runId;
      if (!runId) return;
      for (let i = 0; i < buffer.length; i += 1) {
        const row = buffer[i];
        if (row && !row.detectionRunId) {
          buffer[i] = { ...row, detectionRunId: runId };
        }
      }
    },
    preflight: async () => {
      try {
        const result = await preflightInferenceLedger(tenantId);
        return result.ok === true;
      } catch {
        return false;
      }
    },
    flush: async () => {
      if (buffer.length === 0) {
        return { flushed: 0, failed: false };
      }
      const batch = buffer.splice(0, buffer.length).map((row) =>
        detectionRunId && !row.detectionRunId
          ? { ...row, detectionRunId }
          : row
      );
      let lastError: unknown;
      for (let attempt = 0; attempt < LEDGER_FLUSH_MAX_ATTEMPTS; attempt += 1) {
        try {
          for (let offset = 0; offset < batch.length; offset += LEDGER_BATCH_LIMIT) {
            const chunk = batch.slice(offset, offset + LEDGER_BATCH_LIMIT);
            await flushInferenceAttempts(tenantId, chunk);
          }
          return { flushed: batch.length, failed: false };
        } catch (err) {
          lastError = err;
          if (attempt < LEDGER_FLUSH_MAX_ATTEMPTS - 1) {
            await sleep(250 * (attempt + 1));
          }
        }
      }
      flushFailureMetric += 1;
      try {
        await reportLedgerFlushFailure(tenantId, crypto.randomUUID());
      } catch {
        // A DB outage also prevents durable telemetry; retain the bounded log
        // below and pending-before-dispatch ledger rows for reconciliation.
      }
      // Counts only — never log attempt payloads or transcript text.
      console.error("inference_ledger_flush_failed", {
        tenantId,
        count: batch.length,
        error:
          lastError instanceof Error ? lastError.name : "unknown",
      });
      return { flushed: 0, failed: true };
    },
  };
}
