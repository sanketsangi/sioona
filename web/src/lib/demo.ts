import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { getPilotSettings } from "./backend-client";
import {
  DEMO_BASELINE_OPPORTUNITIES,
  isColdDemoBaseline,
  isPartnerBaseline,
} from "./demo-baseline";
import type { LlmPassStats } from "./detect-llm";
import type {
  PartnerDemoCompleteEvent,
  PartnerDemoProgress,
} from "./partner-demo-progress";
import {
  getOrBuildShowcasePack,
  isShowcasePackCached,
  storeFromShowcasePack,
} from "./showcase-pack-cache";
import { setPilotBaseline, writeStore } from "./store";
import { syncPilotSettingsToBackend } from "./sync-pilot";
import {
  emptyConversationSyncStats,
  type ConversationSyncStats,
} from "./sync-conversations";
import {
  emptyPredictionSyncStats,
  type PredictionSyncStats,
} from "./sync-predictions";
import type { StoreData } from "./types";
import {
  deferredTenantWipeStats,
  type TenantWipeStats,
} from "./wipe-tenant";

export {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
  isColdDemoBaseline,
  isPartnerBaseline,
  isUnsetOrColdDemoBaseline,
} from "./demo-baseline";

export interface PartnerDemoResult {
  store: StoreData;
  importedConversations: number;
  newSignals: number;
  samples: string[];
  baselineOpportunities: number;
  opportunityLift: number;
  predictionSync: PredictionSyncStats;
  conversationSync: ConversationSyncStats;
  detectLlm: LlmPassStats;
  wipe: TenantWipeStats;
}

export interface PartnerDemoOptions {
  onProgress?: (event: PartnerDemoProgress) => void | Promise<void>;
}

type PartnerBaselineSnapshot = {
  baselineOpportunities: number;
  baselineNote?: string;
};

/**
 * Snapshot a partner-set baseline before wipe. Cold-demo 4 is not preserved
 * (Partner Demo re-applies it). Neon is SoT; fail-soft → null.
 */
export async function snapshotPartnerBaseline(
  tenantId: string
): Promise<PartnerBaselineSnapshot | null> {
  try {
    const remote = await getPilotSettings(tenantId);
    if (!remote) return null;
    if (
      isColdDemoBaseline(remote.baseline_opportunities, remote.baseline_note)
    ) {
      return null;
    }
    if (!isPartnerBaseline(remote.baseline_opportunities, remote.baseline_note)) {
      return null;
    }
    const snap: PartnerBaselineSnapshot = {
      baselineOpportunities: remote.baseline_opportunities,
    };
    if (remote.baseline_note?.trim()) {
      snap.baselineNote = remote.baseline_note.trim();
    }
    return snap;
  } catch {
    return null;
  }
}

async function reportDetectFromPack(
  report: PartnerDemoOptions["onProgress"],
  conversationCount: number,
  fromCache: boolean
): Promise<void> {
  if (!report) return;
  if (fromCache) {
    // Preloaded — one tick so the client spinner can advance without waiting.
    await report({
      step: "detect",
      done: conversationCount,
      total: conversationCount,
    });
    return;
  }
  await report({ step: "detect", done: 0, total: conversationCount });
  await report({
    step: "detect",
    done: conversationCount,
    total: conversationCount,
  });
}

/**
 * Replace the JSON store with preloaded Zerodha Batch-02 (instant when cached).
 * Neon wipe + chat/prediction dual-write are deferred by the store route
 * (`after()` + `replaced=1`) so Insights paints the signal queue immediately.
 * Restores a prior partner baseline after seed when one existed (not cold-demo 4).
 */
export async function runPartnerDemo(
  options?: PartnerDemoOptions
): Promise<PartnerDemoResult> {
  const tenantId = emptyShowcaseStore.tenant.id;
  const priorBaseline = await snapshotPartnerBaseline(tenantId);
  const report = options?.onProgress;

  // Wipe is deferred — emit a completed wipe tick so NDJSON clients stay happy.
  await report?.({ step: "wipe", done: 0, total: 1 });
  await report?.({ step: "wipe", done: 1, total: 1 });

  const fromCache = isShowcasePackCached("partner");
  const pack = await getOrBuildShowcasePack("partner");
  await reportDetectFromPack(report, pack.conversations.length, fromCache);

  let store = storeFromShowcasePack(pack, { applyDemoBaseline: true });
  await writeStore(store);
  if (store.pilot) {
    await syncPilotSettingsToBackend(store.tenant.id, store.pilot);
  }

  let baselineOpportunities = DEMO_BASELINE_OPPORTUNITIES;
  if (priorBaseline) {
    store = await setPilotBaseline(
      priorBaseline.baselineOpportunities,
      priorBaseline.baselineNote
    );
    baselineOpportunities =
      store.pilot?.baselineOpportunities ?? priorBaseline.baselineOpportunities;
  }

  const sioonaOpportunities = new Set(
    store.signals.map((s) => s.conversationId)
  ).size;

  return {
    store,
    importedConversations: pack.conversations.length,
    newSignals: pack.signals.length,
    samples: [pack.sampleName],
    baselineOpportunities,
    opportunityLift: sioonaOpportunities - baselineOpportunities,
    predictionSync: emptyPredictionSyncStats(),
    conversationSync: emptyConversationSyncStats(),
    detectLlm: pack.detectLlm,
    // Wipe runs in after() — optimistic ok so clients do not block on Neon.
    wipe: deferredTenantWipeStats(),
  };
}

/**
 * Replace the JSON store with preloaded Groww Sample (instant when cached).
 * Neon wipe + dual-write deferred by the store route. No cold-demo baseline.
 */
export async function runResetDemo(
  options?: PartnerDemoOptions
): Promise<PartnerDemoResult> {
  const report = options?.onProgress;

  await report?.({ step: "wipe", done: 0, total: 1 });
  await report?.({ step: "wipe", done: 1, total: 1 });

  const fromCache = isShowcasePackCached("sample");
  const pack = await getOrBuildShowcasePack("sample");
  await reportDetectFromPack(report, pack.conversations.length, fromCache);

  const store = storeFromShowcasePack(pack, { applyDemoBaseline: false });
  await writeStore(store);
  if (store.pilot) {
    await syncPilotSettingsToBackend(store.tenant.id, store.pilot);
  }

  const sioonaOpportunities = new Set(
    store.signals.map((s) => s.conversationId)
  ).size;
  const baselineOpportunities = store.pilot?.baselineOpportunities ?? 0;

  return {
    store,
    importedConversations: pack.conversations.length,
    newSignals: pack.signals.length,
    samples: [pack.sampleName],
    baselineOpportunities,
    opportunityLift: sioonaOpportunities - baselineOpportunities,
    predictionSync: emptyPredictionSyncStats(),
    conversationSync: emptyConversationSyncStats(),
    detectLlm: pack.detectLlm,
    wipe: deferredTenantWipeStats(),
  };
}

export function partnerDemoCompleteEvent(
  result: PartnerDemoResult
): PartnerDemoCompleteEvent {
  const event: PartnerDemoCompleteEvent = {
    type: "complete",
    importedConversations: result.importedConversations,
    newSignals: result.newSignals,
    samples: result.samples,
    predictionSync: result.predictionSync,
    conversationSync: result.conversationSync,
    detectLlm: result.detectLlm,
  };
  if (!result.wipe.ok) {
    event.wipeFailed = true;
    event.wipeError = result.wipe.error ?? "Signal Score backend unreachable";
  }
  return event;
}
