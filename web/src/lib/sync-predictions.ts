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
/** Parallel POSTs so Partner Demo (~100 chats) does not sit on a 30s sequential chain. */
export const PREDICTION_SYNC_CONCURRENCY = 6;

export type PredictionSyncStats = {
  attempted: number;
  created: number;
  updated: number;
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
  /** Real dual-write ticks: 0 then 1…N as each prediction settles. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];

  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

type SyncRow = {
  signal: Signal;
  attempted: boolean;
  created: boolean;
  updated: boolean;
  failed: boolean;
};

/** Upsert every signal so re-detect updates the same Neon row. */
export async function syncPredictionsToBackend(
  signals: Signal[],
  tenantId: string,
  options?: SyncPredictionsOptions
): Promise<PredictionSyncResult> {
  const sleep = options?.sleep ?? defaultSleep;
  const total = signals.length;
  await options?.onProgress?.(0, total);
  let completed = 0;

  const rows = await mapWithConcurrency(
    signals,
    PREDICTION_SYNC_CONCURRENCY,
    async (signal): Promise<SyncRow> => {
      const hadId = Boolean(signal.backendSignalId);
      try {
        const upserted = await createPredictionWithRetry(tenantId, signal, sleep);
        return {
          signal: { ...signal, backendSignalId: upserted.id },
          attempted: true,
          created: !hadId,
          updated: hadId,
          failed: false,
        };
      } catch (err) {
        const detail = err instanceof Error ? err.message : "unknown error";
        console.warn(
          `[sync-predictions] createPrediction failed tenant=${tenantId} signal=${signal.id}: ${detail}`
        );
        return {
          signal,
          attempted: true,
          created: false,
          updated: false,
          failed: true,
        };
      } finally {
        completed += 1;
        await options?.onProgress?.(completed, total);
      }
    }
  );

  const sync: PredictionSyncStats = {
    attempted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };
  const synced: Signal[] = [];
  for (const row of rows) {
    synced.push(row.signal);
    if (row.attempted) sync.attempted += 1;
    if (row.created) sync.created += 1;
    if (row.updated) sync.updated += 1;
    if (row.failed) sync.failed += 1;
  }

  if (sync.failed > 0) {
    console.warn(
      `[sync-predictions] tenant=${tenantId} attempted=${sync.attempted} created=${sync.created} failed=${sync.failed} skipped=${sync.skipped}`
    );
  }

  return { signals: synced, sync };
}
