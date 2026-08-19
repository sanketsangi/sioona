/**
 * Fail-soft dual-write of store.pilot to Neon (baseline, export count, filename).
 * Merges missing weeklyExportCount / lastUploadedFileName from Neon before PUT.
 * Showcase load calls this after Partner Demo wipe so filename survives cold-start hydrate.
 */

import {
  getPilotSettings,
  putPilotSettings,
  type BackendPilotSettings,
} from "@/lib/backend-client";
import type { PilotSettings } from "@/lib/types";

export async function syncPilotSettingsToBackend(
  tenantId: string,
  pilot: PilotSettings
): Promise<BackendPilotSettings | null> {
  try {
    const remote = await getPilotSettings(tenantId).catch(() => null);

    const weeklyExportCount =
      pilot.weeklyExportCount ?? remote?.weekly_export_count ?? null;

    const lastUploadedFileName =
      pilot.lastUploadedFileName ?? remote?.last_uploaded_file_name ?? null;

    return await putPilotSettings(tenantId, {
      baseline_opportunities: pilot.baselineOpportunities,
      baseline_note: pilot.baselineNote ?? null,
      weekly_export_count: weeklyExportCount,
      last_uploaded_file_name: lastUploadedFileName,
    });
  } catch {
    return null;
  }
}
