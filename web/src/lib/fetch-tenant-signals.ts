/**
 * Fetch tenant predictions (feedback + Acted) from FastAPI.
 * Returns explicit ok/error — never a silent empty list on failure.
 */

import {
  BackendClientError,
  getTenantSignals,
  type BackendPredictionWithFeedback,
} from "./backend-client";

export type TenantSignalsResult =
  | { ok: true; rows: BackendPredictionWithFeedback[] }
  | { ok: false; error: string };

export async function fetchTenantSignals(
  tenantId: string,
  opts?: {
    /** Active JSON keep-set. Empty array → no rows. Omit for hydrate / wipe. */
    conversationIds?: string[];
  }
): Promise<TenantSignalsResult> {
  if (
    opts?.conversationIds !== undefined &&
    opts.conversationIds.every((id) => id.length === 0)
  ) {
    return { ok: true, rows: [] };
  }
  try {
    const rows = await getTenantSignals(tenantId, {
      conversationIds: opts?.conversationIds,
    });
    return { ok: true, rows };
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
