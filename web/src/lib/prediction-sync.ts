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
  const updatedRaw = Number(o.updated);
  const updated = Number.isFinite(updatedRaw) ? updatedRaw : 0;
  if (
    ![attempted, created, failed, skipped].every((n) => Number.isFinite(n))
  ) {
    return null;
  }
  return {
    attempted: Math.max(0, Math.floor(attempted)),
    created: Math.max(0, Math.floor(created)),
    updated: Math.max(0, Math.floor(updated)),
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

/** Signals still missing a Neon prediction id (excludes Neon queue stubs). */
export function countUnsyncedPredictions(
  signals: { id: string; backendSignalId?: string }[]
): number {
  return signals.filter(
    (s) => !s.backendSignalId && !isNeonStubSignalId(s.id)
  ).length;
}

/**
 * Show the fail-loud banner only when URL reports failures AND the store
 * still has unsynced rows — ignore stale ?syncFailed= after a successful re-detect.
 */
export function shouldShowSyncFailureBanner(
  syncFailedParam: number,
  signals: { id: string; backendSignalId?: string }[]
): boolean {
  return syncFailedParam > 0 && countUnsyncedPredictions(signals) > 0;
}

/**
 * Partner-facing warning when prediction sync failed.
 * Those reviews stay off Eval until a later sync succeeds.
 */
export function uploadPredictionSyncWarning(syncFailed: number): string | null {
  if (!Number.isFinite(syncFailed) || syncFailed < 1) return null;
  const n = Math.floor(syncFailed);
  const noun = n === 1 ? "prediction" : "predictions";
  return `${n} ${noun} not synced. Those reviews will not count on Eval until sync succeeds. Re-run Detection on Insights.`;
}

/**
 * Eval metrics warning when uploaded chats and saved reviews disagree.
 * An empty Neon review count is not agreement while JSON still has the
 * keep-set and unsynced saved reviews.
 */
export function evalSyncWarningWhenReviewsDisagree(input: {
  syncFailed?: number;
  signals: { id: string; backendSignalId?: string; feedback?: unknown }[];
  conversationCount: number;
  /** Neon `reviewed_count`. `null` means the score service did not answer. */
  neonReviewedCount: number | null;
}): string | null {
  const unsynced = countUnsyncedPredictions(input.signals);
  const syncFailed = input.syncFailed ?? 0;
  const urlFailure = shouldShowSyncFailureBanner(syncFailed, input.signals);
  const savedReviews = input.signals.filter((signal) => signal.feedback).length;
  const emptyNeonMissesSavedReviews =
    input.conversationCount > 0 &&
    savedReviews > 0 &&
    input.neonReviewedCount === 0 &&
    unsynced > 0;
  if (!urlFailure && !emptyNeonMissesSavedReviews) return null;
  const n = urlFailure ? Math.max(syncFailed, unsynced) : unsynced;
  return uploadPredictionSyncWarning(n);
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
