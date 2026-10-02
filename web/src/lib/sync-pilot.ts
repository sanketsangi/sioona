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
import {
  isPartnerBaseline,
  isUnsetOrColdDemoBaseline,
} from "@/lib/demo-baseline";
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
 * When JSON already holds a partner baseline and Neon is still cold-demo /
 * unset (wipe race), keep the partner baseline so Eval lift stays honest.
 * Returns a new store when pilot changed; otherwise the same reference.
 */
export function overlayPilotFromRemote(
  store: StoreData,
  remote: BackendPilotSettings | null
): StoreData {
  if (!remote) return store;
  let next = pilotSettingsFromRemote(remote);
  const prev = store.pilot;
  const localPartner =
    prev != null &&
    isPartnerBaseline(prev.baselineOpportunities, prev.baselineNote);
  const remotePartner = isPartnerBaseline(
    remote.baseline_opportunities,
    remote.baseline_note
  );
  if (
    localPartner &&
    !remotePartner &&
    isUnsetOrColdDemoBaseline(
      remote.baseline_opportunities,
      remote.baseline_note
    )
  ) {
    next = {
      ...next,
      baselineOpportunities: prev.baselineOpportunities,
      ...(prev.baselineNote ? { baselineNote: prev.baselineNote } : {}),
    };
  }
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
 * True when JSON pilot moved on during the Neon GET (Partner Demo / Reset /
 * replace). Do not persist a healed object built from the pre-GET snapshot.
 */
export function localPilotSupersedesHeal(
  current: PilotSettings | undefined,
  snapshot: PilotSettings | undefined,
): boolean {
  const currentName = current?.lastUploadedFileName?.trim() ?? "";
  const snapshotName = snapshot?.lastUploadedFileName?.trim() ?? "";
  if (currentName !== snapshotName) return true;

  const currentAt = current?.updatedAt?.trim();
  const snapshotAt = snapshot?.updatedAt?.trim();
  if (!currentAt || currentAt === snapshotAt) return false;
  if (!snapshotAt) return true;
  const currentMs = Date.parse(currentAt);
  const snapshotMs = Date.parse(snapshotAt);
  if (!Number.isFinite(currentMs) || !Number.isFinite(snapshotMs)) {
    return currentAt !== snapshotAt;
  }
  return currentMs > snapshotMs;
}

/**
 * Persist a healed pilot onto the latest JSON snapshot.
 * SSR holds `storeRaw` across the Neon GET; a full write of that snapshot
 * would clobber concurrent feedback / Acted on the same instance.
 * Skips when Partner Demo / replace wrote a newer keep-set during the GET.
 */
export async function persistHealedPilot(
  healed: StoreData,
  original: StoreData
): Promise<void> {
  if (healed === original) return;
  const { readStore, writeStore } = await import("./store");
  const latest = await readStore();
  if (localPilotSupersedesHeal(latest.pilot, original.pilot)) return;
  await writeStore({ ...latest, pilot: healed.pilot });
}

/**
 * Insights/Eval after-paint heal must not revert a just-written JSON
 * keep-set filename to a stale Neon pack (Partner Demo wipe still in flight).
 * Upload still awaits `overlayPilotFromRemote` so Neon can win there.
 */
export function preserveLocalKeepSetFilename(
  healed: StoreData,
  latest: StoreData
): StoreData {
  const localName = latest.pilot?.lastUploadedFileName?.trim();
  if (!localName || !latest.pilot) return healed;
  if (healed.pilot?.lastUploadedFileName === localName) return healed;
  if (!healed.pilot) {
    return {
      ...healed,
      pilot: { ...latest.pilot, lastUploadedFileName: localName },
    };
  }
  return {
    ...healed,
    pilot: { ...healed.pilot, lastUploadedFileName: localName },
  };
}

/**
 * Off-TTFB Neon `GET …/pilot` + heal. Re-read after the GET so a Partner
 * Demo / replace that landed mid-flight is not overwritten by stale Neon.
 */
export async function persistDeferredPilotRefresh(
  tenantId: string
): Promise<void> {
  const { readStore } = await import("./store");
  const snapshot = await readStore();
  if (snapshot.tenant.id !== tenantId) return;
  const healed = await refreshStorePilotFromNeon(snapshot);
  // Re-read after the GET — Partner Demo / replace may have landed.
  const current = await readStore();
  if (current.tenant.id !== tenantId) return;
  if (localPilotSupersedesHeal(current.pilot, snapshot.pilot)) return;
  await persistHealedPilot(
    preserveLocalKeepSetFilename(healed, current),
    snapshot,
  );
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
  } catch (err) {
    console.warn(
      `[sync-pilot] put failed tenant=${tenantId}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return null;
  }
}
