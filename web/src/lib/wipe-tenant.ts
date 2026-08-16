/**
 * Fail-soft Neon tenant wipe for Reset Demo / Partner Demo.
 * Reports failure so callers can surface wipeFailed — never silently skip.
 */

import {
  wipeTenantData,
  type BackendTenantDataWipeResult,
} from "./backend-client";

export type TenantWipeStats = BackendTenantDataWipeResult & {
  ok: boolean;
  error?: string;
};

const EMPTY_COUNTS: BackendTenantDataWipeResult = {
  conversations: 0,
  messages: 0,
  predictions: 0,
  feedback: 0,
  pilot_settings: 0,
};

export function emptyTenantWipeStats(error?: string): TenantWipeStats {
  return { ...EMPTY_COUNTS, ok: false, error };
}

/**
 * Wipe this tenant's Neon data. On FastAPI down / error, returns ok:false
 * with zero counts — caller should still reseed JSON and report wipeFailed.
 */
export async function wipeTenantDataFailSoft(
  tenantId: string
): Promise<TenantWipeStats> {
  try {
    const counts = await wipeTenantData(tenantId);
    return { ...counts, ok: true };
  } catch (err) {
    const detail =
      err instanceof Error ? err.message : "Signal Score backend unreachable";
    console.warn(
      `[wipe-tenant] wipe failed tenant=${tenantId}: ${detail}`
    );
    return emptyTenantWipeStats(detail);
  }
}
