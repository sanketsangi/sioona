/**
 * Dual-write detected signals to the FastAPI Signal Score service.
 * Best-effort with multi-retry + short backoff; failures leave JSON signals
 * without backendSignalId (feedback lazy-create remains the safety net).
 *
 * Prefers POST /v1/predictions/bulk (chunked) so Partner Demo / ingest do not
 * pay N HTTP round-trips. Falls back to per-signal POST when bulk is missing
 * (older FastAPI) so staged deploys keep working.
 */

import {
  BackendClientError,
  createPrediction,
  createPredictionsBulk,
} from "./backend-client";
import type { Signal } from "./types";

/** Initial try + this many retries on transient failure. */
export const PREDICTION_SYNC_MAX_RETRIES = 2;
/** Total attempts = 1 + PREDICTION_SYNC_MAX_RETRIES. */
export const PREDICTION_SYNC_MAX_ATTEMPTS = 1 + PREDICTION_SYNC_MAX_RETRIES;
/** Backoff after each failed attempt (ms), before the next try. */
export const PREDICTION_SYNC_BACKOFF_MS = [200, 800] as const;
/**
 * Parallel POSTs for single-prediction fallback only (old API without bulk).
 * Bulk path does not use this.
 */
export const PREDICTION_SYNC_CONCURRENCY = 6;
/** Chunk size for /v1/predictions/bulk — light payloads; one chunk covers showcase packs. */
export const PREDICTION_SYNC_CHUNK_SIZE = 50;

export type PredictionSyncStats = {
  attempted: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
};

/** Immediate ingest response: dual-write runs after() so stats are still zero. */
export function emptyPredictionSyncStats(): PredictionSyncStats {
  return {
    attempted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };
}

export type PredictionSyncResult = {
  signals: Signal[];
  sync: PredictionSyncStats;
};

export type SyncPredictionsOptions = {
  /** Injectable for tests; defaults to real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
  /** Real dual-write ticks: 0 then N as each chunk (or row) settles. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
};

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function predictionInput(signal: Signal) {
  return {
    conversation_id: signal.conversationId,
    signal_type: signal.type,
    confidence: signal.confidence,
    summary: signal.summary,
  };
}

function predictionMatchKey(
  conversationId: string,
  signalType: string
): string {
  return `${conversationId}:${signalType}`;
}

async function createPredictionWithRetry(
  tenantId: string,
  signal: Signal,
  sleep: (ms: number) => Promise<void>
): Promise<{ id: string }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < PREDICTION_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await createPrediction(tenantId, predictionInput(signal));
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

async function createPredictionsBulkWithRetry(
  tenantId: string,
  chunk: Signal[],
  sleep: (ms: number) => Promise<void>
) {
  let lastError: unknown;
  for (let attempt = 0; attempt < PREDICTION_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await createPredictionsBulk(
        tenantId,
        chunk.map(predictionInput)
      );
    } catch (err) {
      lastError = err;
      if (
        err instanceof BackendClientError &&
        (err.status === 404 || err.status === 405)
      ) {
        throw err;
      }
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
    : new Error("createPredictionsBulk failed after retries");
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

async function syncPredictionsPerSignal(
  signals: Signal[],
  tenantId: string,
  sleep: (ms: number) => Promise<void>,
  onProgress?: SyncPredictionsOptions["onProgress"]
): Promise<SyncRow[]> {
  const total = signals.length;
  let completed = 0;
  return mapWithConcurrency(
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
        await onProgress?.(completed, total);
      }
    }
  );
}

async function syncPredictionsBulk(
  signals: Signal[],
  tenantId: string,
  sleep: (ms: number) => Promise<void>,
  onProgress?: SyncPredictionsOptions["onProgress"]
): Promise<SyncRow[]> {
  const rows: SyncRow[] = signals.map((signal) => ({
    signal,
    attempted: false,
    created: false,
    updated: false,
    failed: false,
  }));
  let completed = 0;

  for (let start = 0; start < signals.length; start += PREDICTION_SYNC_CHUNK_SIZE) {
    const chunk = signals.slice(start, start + PREDICTION_SYNC_CHUNK_SIZE);
    try {
      const result = await createPredictionsBulkWithRetry(tenantId, chunk, sleep);
      const byKey = new Map(
        result.predictions.map((prediction) => [
          predictionMatchKey(prediction.conversation_id, prediction.signal_type),
          prediction,
        ])
      );
      for (let i = 0; i < chunk.length; i++) {
        const index = start + i;
        const signal = chunk[i];
        const matched = byKey.get(
          predictionMatchKey(signal.conversationId, signal.type)
        );
        const hadId = Boolean(signal.backendSignalId);
        if (!matched) {
          rows[index] = {
            signal,
            attempted: true,
            created: false,
            updated: false,
            failed: true,
          };
          continue;
        }
        rows[index] = {
          signal: { ...signal, backendSignalId: matched.id },
          attempted: true,
          created: !hadId,
          updated: hadId,
          failed: false,
        };
      }
    } catch (err) {
      if (
        err instanceof BackendClientError &&
        (err.status === 404 || err.status === 405)
      ) {
        throw err;
      }
      const detail = err instanceof Error ? err.message : "unknown error";
      console.warn(
        `[sync-predictions] createPredictionsBulk failed tenant=${tenantId} chunk=${start}: ${detail}`
      );
      for (let i = 0; i < chunk.length; i++) {
        rows[start + i] = {
          signal: chunk[i],
          attempted: true,
          created: false,
          updated: false,
          failed: true,
        };
      }
    }
    completed = Math.min(signals.length, start + chunk.length);
    await onProgress?.(completed, signals.length);
  }

  return rows;
}

/** Upsert every signal so re-detect updates the same Neon row. */
export async function syncPredictionsToBackend(
  signals: Signal[],
  tenantId: string,
  options?: SyncPredictionsOptions
): Promise<PredictionSyncResult> {
  const sleep = options?.sleep ?? defaultSleep;
  const total = signals.length;
  await options?.onProgress?.(0, total);

  let rows: SyncRow[];
  try {
    rows = await syncPredictionsBulk(signals, tenantId, sleep, options?.onProgress);
  } catch (err) {
    if (
      err instanceof BackendClientError &&
      (err.status === 404 || err.status === 405)
    ) {
      console.warn(
        `[sync-predictions] bulk unavailable (${err.status}); falling back to per-signal POSTs`
      );
      await options?.onProgress?.(0, total);
      rows = await syncPredictionsPerSignal(
        signals,
        tenantId,
        sleep,
        options?.onProgress
      );
    } else {
      throw err;
    }
  }

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
