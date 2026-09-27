/**
 * Off-TTFB dual-write after Insights/Eval cold start.
 * First paint uses GET needs-review / GET signals; this upserts JSON detect
 * rows so backendSignalId and Neon stay in sync without blocking GET /.
 */

import {
  countUnsyncedPredictions,
  persistedSyncFailureFromStats,
} from "./prediction-sync";
import { replayAbsentFeedback } from "./replay-absent-feedback";
import { readStore, writeStore } from "./store";
import {
  syncPredictionsToBackend,
  type PredictionSyncStats,
} from "./sync-predictions";
import type { PredictionSyncFailure, Signal, StoreData } from "./types";

/** Copy upserted Neon ids onto the latest JSON snapshot (keep feedback; heal stale ids). */
export function mergeSyncedBackendIds(
  latest: Signal[],
  synced: Signal[]
): Signal[] {
  const byId = new Map<string, string>();
  for (const signal of synced) {
    if (signal.backendSignalId) {
      byId.set(signal.id, signal.backendSignalId);
    }
  }
  if (byId.size === 0) return latest;

  let changed = false;
  const next = latest.map((signal) => {
    const id = byId.get(signal.id);
    if (!id || signal.backendSignalId === id) return signal;
    changed = true;
    return { ...signal, backendSignalId: id };
  });
  return changed ? next : latest;
}

function sameSyncFailure(
  prev: PredictionSyncFailure | undefined,
  next: PredictionSyncFailure | null
): boolean {
  if (!next) return prev == null;
  return prev?.failed === next.failed && prev?.created === next.created;
}

/**
 * Merge Neon ids and set or clear the syncFailed banner in one snapshot.
 * `null` means the latest store already matches — skip the write.
 */
export function applyDeferredPredictionSyncResult(
  latest: StoreData,
  synced: Signal[],
  sync: PredictionSyncStats
): StoreData | null {
  const merged = mergeSyncedBackendIds(latest.signals, synced);
  const failure = persistedSyncFailureFromStats(sync);
  if (
    merged === latest.signals &&
    sameSyncFailure(latest.predictionSyncFailure, failure)
  ) {
    return null;
  }
  const next: StoreData = { ...latest, signals: merged };
  if (failure) next.predictionSyncFailure = failure;
  else delete next.predictionSyncFailure;
  return next;
}

async function writeDeferredSyncFailure(
  tenantId: string,
  failure: PredictionSyncFailure
): Promise<void> {
  const latest = await readStore();
  if (latest.tenant.id !== tenantId) return;
  if (sameSyncFailure(latest.predictionSyncFailure, failure)) return;
  await writeStore({ ...latest, predictionSyncFailure: failure });
}

export async function persistDeferredPredictionSync(
  tenantId: string
): Promise<void> {
  const store = await readStore();
  if (store.tenant.id !== tenantId || store.signals.length === 0) return;

  let synced: Signal[];
  let sync: PredictionSyncStats;
  try {
    const result = await syncPredictionsToBackend(store.signals, tenantId);
    synced = result.signals;
    sync = result.sync;
  } catch (err) {
    const unsynced = countUnsyncedPredictions(store.signals);
    await writeDeferredSyncFailure(tenantId, {
      failed: Math.max(unsynced, 1),
      created: 0,
    });
    throw err;
  }

  const latest = await readStore();
  if (latest.tenant.id !== tenantId) return;
  const next = applyDeferredPredictionSyncResult(latest, synced, sync);
  if (next) await writeStore(next);
  await replayAbsentFeedback(tenantId, next?.signals ?? latest.signals);
}
