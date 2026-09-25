/**
 * Off-TTFB dual-write after Insights/Eval cold start.
 * First paint uses GET needs-review / GET signals; this upserts JSON detect
 * rows so backendSignalId and Neon stay in sync without blocking GET /.
 */

import { replayAbsentFeedback } from "./replay-absent-feedback";
import { readStore, writeStore } from "./store";
import { syncPredictionsToBackend } from "./sync-predictions";
import type { Signal } from "./types";

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

export async function persistDeferredPredictionSync(
  tenantId: string
): Promise<void> {
  const store = await readStore();
  if (store.tenant.id !== tenantId || store.signals.length === 0) return;

  const { signals: synced } = await syncPredictionsToBackend(
    store.signals,
    tenantId
  );
  const latest = await readStore();
  const merged = mergeSyncedBackendIds(latest.signals, synced);
  if (merged !== latest.signals) {
    await writeStore({ ...latest, signals: merged });
  }
  await replayAbsentFeedback(tenantId, merged);
}
