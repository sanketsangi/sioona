/**
 * Dual-write detected signals to the FastAPI Signal Score service.
 * Best-effort with multi-retry + short backoff; failures leave JSON signals
 * without backendSignalId (feedback lazy-create remains the safety net).
 */

import { createPrediction } from "./backend-client";
import type { Signal } from "./types";

/** Initial try + this many retries on transient failure. */
export const PREDICTION_SYNC_MAX_RETRIES = 2;
/** Total attempts = 1 + PREDICTION_SYNC_MAX_RETRIES. */
export const PREDICTION_SYNC_MAX_ATTEMPTS = 1 + PREDICTION_SYNC_MAX_RETRIES;
/** Backoff after each failed attempt (ms), before the next try. */
export const PREDICTION_SYNC_BACKOFF_MS = [200, 800] as const;

export type PredictionSyncStats = {
  attempted: number;
  created: number;
  failed: number;
  skipped: number;
};

export type PredictionSyncResult = {
  signals: Signal[];
  sync: PredictionSyncStats;
};

export type SyncPredictionsOptions = {
  /** Injectable for tests; defaults to real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
};

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPredictionWithRetry(
  tenantId: string,
  signal: Signal,
  sleep: (ms: number) => Promise<void>
): Promise<{ id: string }> {
  const input = {
    conversation_id: signal.conversationId,
    signal_type: signal.type,
    confidence: signal.confidence,
    summary: signal.summary,
  };

  let lastError: unknown;
  for (let attempt = 0; attempt < PREDICTION_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await createPrediction(tenantId, input);
    } catch (err) {
      lastError = err;
      if (attempt < PREDICTION_SYNC_MAX_ATTEMPTS - 1) {
        const delay =
          PREDICTION_SYNC_BACKOFF_MS[
            Math.min(attempt, PREDICTION_SYNC_BACKOFF_MS.length - 1)
          ] ?? PREDICTION_SYNC_BACKOFF_MS[PREDICTION_SYNC_BACKOFF_MS.length - 1];
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("createPrediction failed after retries");
}

/** POST predictions missing a backend id; preserve existing backendSignalId. */
export async function syncPredictionsToBackend(
  signals: Signal[],
  tenantId: string,
  options?: SyncPredictionsOptions
): Promise<PredictionSyncResult> {
  const sleep = options?.sleep ?? defaultSleep;
  const synced: Signal[] = [];
  const sync: PredictionSyncStats = {
    attempted: 0,
    created: 0,
    failed: 0,
    skipped: 0,
  };

  for (const signal of signals) {
    if (signal.backendSignalId) {
      synced.push(signal);
      sync.skipped += 1;
      continue;
    }

    sync.attempted += 1;
    try {
      const created = await createPredictionWithRetry(tenantId, signal, sleep);
      synced.push({ ...signal, backendSignalId: created.id });
      sync.created += 1;
    } catch (err) {
      sync.failed += 1;
      synced.push(signal);
      const detail = err instanceof Error ? err.message : "unknown error";
      console.warn(
        `[sync-predictions] createPrediction failed tenant=${tenantId} signal=${signal.id}: ${detail}`
      );
    }
  }

  if (sync.failed > 0) {
    console.warn(
      `[sync-predictions] tenant=${tenantId} attempted=${sync.attempted} created=${sync.created} failed=${sync.failed} skipped=${sync.skipped}`
    );
  }

  return { signals: synced, sync };
}
