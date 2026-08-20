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
  tenantId: string
): Promise<TenantSignalsResult> {
  try {
    const rows = await getTenantSignals(tenantId);
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
