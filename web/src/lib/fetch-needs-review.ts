import { conversationScopes } from "./conversation-scopes";
/**
 * Fetch Shadow Mode pending queue from FastAPI needs-review.
 * Returns explicit ok/error — never a silent empty list on failure.
 *
 * The route pages at 100. This follows cursors until the final page so a
 * keep-set larger than 100 still reaches the Insights pager. Pass
 * `conversationIds` when JSON already holds the keep-set so other packs
 * do not fill those pages. Omit them only for wipe recovery.
 */

import {
  BackendClientError,
  getNeedsReviewPage,
  type BackendPrediction,
} from "./backend-client";

export type NeedsReviewResult =
  | { ok: true; predictions: BackendPrediction[] }
  | { ok: false; error: string };

export type FetchNeedsReviewOptions = {
  limit?: number;
  /** Active JSON keep-set. Empty array → no pending rows. */
  conversationIds?: string[];
    q?: string;
};

/** Backend max per request. */
const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 100;
/** Stop a stuck full-page loop. 100 pages covers a large weekly keep-set. */

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
    let pages = 0;
    for (const scope of conversationScopes(opts.conversationIds)) {
      let after: string | undefined;
      const seen = new Set<string>();
      while (true) {
        if (pages++ >= 100) throw new Error("Review queue exceed the page budget; narrow the conversation scope.");
        const batch = await getNeedsReviewPage(tenantId, { limit: limit, after, conversationIds: scope, q: opts.q });
        predictions.push(...batch.predictions);
        if (!batch.next_cursor) break;
        if (seen.has(batch.next_cursor)) throw new Error("Review queue returned a repeated cursor.");
        seen.add(batch.next_cursor);
        after = batch.next_cursor;
      }
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
