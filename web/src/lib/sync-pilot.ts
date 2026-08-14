/**
 * Fail-soft dual-write of store.pilot to Neon.
 * Partner Demo / Reset must not call this (showcase must not clear partner cadence).
 */

import {
  putPilotSettings,
  type BackendPilotSettings,
} from "@/lib/backend-client";
import type { PilotSettings } from "@/lib/types";

export async function syncPilotSettingsToBackend(
  tenantId: string,
  pilot: PilotSettings
): Promise<BackendPilotSettings | null> {
  try {
    return await putPilotSettings(tenantId, {
      baseline_opportunities: pilot.baselineOpportunities,
      baseline_note: pilot.baselineNote ?? null,
      weekly_export_count: pilot.weeklyExportCount ?? null,
    });
  } catch {
    return null;
  }
}
