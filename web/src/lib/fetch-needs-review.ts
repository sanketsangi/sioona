/**
 * Fetch Shadow Mode pending queue from FastAPI needs-review.
 * Returns explicit ok/error — never a silent empty list on failure.
 */

import {
  BackendClientError,
  getNeedsReview,
  type BackendPrediction,
} from "./backend-client";

export type NeedsReviewResult =
  | { ok: true; predictions: BackendPrediction[] }
  | { ok: false; error: string };

const DEFAULT_LIMIT = 20;

export async function fetchNeedsReview(
  tenantId: string,
  limit = DEFAULT_LIMIT
): Promise<NeedsReviewResult> {
  try {
    const predictions = await getNeedsReview(tenantId, limit);
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
