/**
 * Fetch this tenant's predictions + feedback from FastAPI (Insights Done tree).
 * Returns explicit ok/error — never a silent empty list on failure.
 */

import {
  BackendClientError,
  getTenantSignals,
  type BackendPredictionWithFeedback,
} from "./backend-client";

export type TenantSignalsResult =
  | { ok: true; predictions: BackendPredictionWithFeedback[] }
  | { ok: false; error: string };

export async function fetchTenantSignals(
  tenantId: string
): Promise<TenantSignalsResult> {
  try {
    const predictions = await getTenantSignals(tenantId);
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
