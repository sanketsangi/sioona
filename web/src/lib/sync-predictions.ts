/**
 * Dual-write detected signals to the FastAPI Signal Score service.
 * Best-effort with one retry: failures leave JSON signals without backendSignalId.
 */

import { createPrediction } from "./backend-client";
import type { Signal } from "./types";

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

async function createPredictionWithRetry(
  tenantId: string,
  signal: Signal
): Promise<{ id: string }> {
  const input = {
    conversation_id: signal.conversationId,
    signal_type: signal.type,
    confidence: signal.confidence,
    summary: signal.summary,
  };
  try {
    return await createPrediction(tenantId, input);
  } catch {
    return await createPrediction(tenantId, input);
  }
}

/** POST predictions missing a backend id; preserve existing backendSignalId. */
export async function syncPredictionsToBackend(
  signals: Signal[],
  tenantId: string
): Promise<PredictionSyncResult> {
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
      const created = await createPredictionWithRetry(tenantId, signal);
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
