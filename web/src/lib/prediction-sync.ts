/**
 * Helpers for dual-write predictionSync stats in API responses and URL state.
 */

import type { PredictionSyncStats } from "./sync-predictions";

export type { PredictionSyncStats };

export function parsePredictionSync(
  raw: unknown
): PredictionSyncStats | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const attempted = Number(o.attempted);
  const created = Number(o.created);
  const failed = Number(o.failed);
  const skipped = Number(o.skipped);
  if (
    ![attempted, created, failed, skipped].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  return {
    attempted: Math.max(0, Math.floor(attempted)),
    created: Math.max(0, Math.floor(created)),
    failed: Math.max(0, Math.floor(failed)),
    skipped: Math.max(0, Math.floor(skipped)),
  };
}

export function hasSyncFailures(
  sync: PredictionSyncStats | null | undefined
): boolean {
  return Boolean(sync && sync.failed > 0);
}

/** URL query extras for Insights when dual-write had failures. */
export function syncQueryExtras(
  sync: PredictionSyncStats | null | undefined
): Record<string, string | null> {
  if (!sync || sync.failed <= 0) {
    return { syncFailed: null, syncCreated: null };
  }
  return {
    syncFailed: String(sync.failed),
    syncCreated: String(sync.created),
  };
}

export function parseSyncFailedParam(raw?: string | null): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return 0;
  return Math.floor(n);
}

export function parseSyncCreatedParam(raw?: string | null): number {
  if (raw == null || raw === "") return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

const NEON_STUB_PREFIX = "sig_neon_";

/** Extract Neon prediction UUID from a stub signal id (`sig_neon_{uuid}`). */
export function neonPredictionIdFromStubSignalId(
  signalId: string
): string | null {
  if (!signalId.startsWith(NEON_STUB_PREFIX)) return null;
  const id = signalId.slice(NEON_STUB_PREFIX.length).trim();
  return id.length > 0 ? id : null;
}

export function isNeonStubSignalId(signalId: string): boolean {
  return neonPredictionIdFromStubSignalId(signalId) !== null;
}
