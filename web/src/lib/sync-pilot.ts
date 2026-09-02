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
import type { PilotSettings, StoreData } from "@/lib/types";

export function pilotSettingsFromRemote(
  remote: BackendPilotSettings
): PilotSettings {
  return {
    baselineOpportunities: remote.baseline_opportunities,
    ...(remote.baseline_note ? { baselineNote: remote.baseline_note } : {}),
    ...(remote.weekly_export_count != null
      ? { weeklyExportCount: remote.weekly_export_count }
      : {}),
    ...(remote.last_uploaded_file_name
      ? { lastUploadedFileName: remote.last_uploaded_file_name }
      : {}),
    updatedAt: remote.updated_at,
  };
}

/**
 * Neon is SoT for pilot. Overlay remote settings onto a JSON store snapshot
 * (Vercel /tmp can lag after Partner Demo / set_baseline on another instance).
 * Returns a new store when pilot changed; otherwise the same reference.
 */
export function overlayPilotFromRemote(
  store: StoreData,
  remote: BackendPilotSettings | null
): StoreData {
  if (!remote) return store;
  const next = pilotSettingsFromRemote(remote);
  const prev = store.pilot;
  if (
    prev &&
    prev.baselineOpportunities === next.baselineOpportunities &&
    (prev.baselineNote ?? null) === (next.baselineNote ?? null) &&
    (prev.weeklyExportCount ?? null) === (next.weeklyExportCount ?? null) &&
    (prev.lastUploadedFileName ?? null) === (next.lastUploadedFileName ?? null)
  ) {
    return store;
  }
  return { ...store, pilot: next };
}

/** Fail-soft GET + overlay. Used on platform page SSR. */
export async function refreshStorePilotFromNeon(
  store: StoreData
): Promise<StoreData> {
  try {
    const remote = await getPilotSettings(store.tenant.id);
    return overlayPilotFromRemote(store, remote);
  } catch {
    return store;
  }
}

/**
 * Persist a healed pilot onto the latest JSON snapshot.
 * SSR holds `storeRaw` across the Neon GET; a full write of that snapshot
 * would clobber concurrent feedback / Acted on the same instance.
 */
export async function persistHealedPilot(
  healed: StoreData,
  original: StoreData
): Promise<void> {
  if (healed === original) return;
  const { readStore, writeStore } = await import("./store");
  const latest = await readStore();
  await writeStore({ ...latest, pilot: healed.pilot });
}

/**
 * Off-TTFB Neon `GET …/pilot` + heal. Insights/Eval first paint uses JSON
 * `store.pilot` (header filename / cadence helper). Upload still awaits
 * `refreshStorePilotFromNeon` on GET / so cadence chrome is live.
 */
export async function persistDeferredPilotRefresh(
  tenantId: string
): Promise<void> {
  const { readStore } = await import("./store");
  const latest = await readStore();
  if (latest.tenant.id !== tenantId) return;
  const healed = await refreshStorePilotFromNeon(latest);
  await persistHealedPilot(healed, latest);
}

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
