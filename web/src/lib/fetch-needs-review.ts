/**
 * Fetch Shadow Mode pending queue from FastAPI needs-review.
 * Returns explicit ok/error — never a silent empty list on failure.
 *
 * The route pages at 100. This walks `offset` until a short page so a
 * keep-set larger than 100 still reaches the Insights pager. Pass
 * `conversationIds` when JSON already holds the keep-set so other packs
 * do not fill those pages. Omit them only for wipe recovery.
 */

import {
  BackendClientError,
  getNeedsReview,
  type BackendPrediction,
} from "./backend-client";

export type NeedsReviewResult =
  | { ok: true; predictions: BackendPrediction[] }
  | { ok: false; error: string };

export type FetchNeedsReviewOptions = {
  limit?: number;
  /** Active JSON keep-set. Empty array → no pending rows. */
  conversationIds?: string[];
};

/** Backend max per request. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
/** Stop a stuck full-page loop. 100 pages covers a large weekly keep-set. */
const MAX_PAGES = 100;

function pageLimit(limit: number | undefined): number {
  if (limit === undefined || !Number.isFinite(limit)) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));
}

function isEmptyKeepSet(conversationIds: string[] | undefined): boolean {
  return (
    conversationIds !== undefined &&
    conversationIds.every((id) => id.length === 0)
  );
}

export async function fetchNeedsReview(
  tenantId: string,
  limitOrOpts?: number | FetchNeedsReviewOptions
): Promise<NeedsReviewResult> {
  const opts: FetchNeedsReviewOptions =
    typeof limitOrOpts === "number" ? { limit: limitOrOpts } : (limitOrOpts ?? {});
  if (isEmptyKeepSet(opts.conversationIds)) {
    return { ok: true, predictions: [] };
  }

  const limit = pageLimit(opts.limit);
  const predictions: BackendPrediction[] = [];
  try {
    for (let page = 0; page < MAX_PAGES; page += 1) {
      const offset = page * limit;
      const batch = await getNeedsReview(tenantId, {
        limit,
        offset,
        conversationIds: opts.conversationIds,
      });
      predictions.push(...batch);
      if (batch.length < limit) break;
    }
    return { ok: true, predictions };
  } catch (err) {
    const message =
      err instanceof BackendClientError
        ? err.message
        : err instanceof Error
          ? err.message
          : "Signal Score backend unavailable";
    return { ok: false, error: message };
  }
}
