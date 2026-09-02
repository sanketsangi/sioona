import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { getPilotSettings } from "./backend-client";
import {
  loadTestingJsonIntoStore,
  loadZerodhaBatch02IntoStore,
} from "./load-testing-json-store";
import {
  DEMO_BASELINE_OPPORTUNITIES,
  isColdDemoBaseline,
} from "./demo-baseline";
import type { LlmPassStats } from "./detect-llm";
import type {
  PartnerDemoCompleteEvent,
  PartnerDemoProgress,
} from "./partner-demo-progress";
import { setPilotBaseline } from "./store";
import type { ConversationSyncStats } from "./sync-conversations";
import type { PredictionSyncStats } from "./sync-predictions";
import type { StoreData } from "./types";
import {
  wipeTenantDataFailSoft,
  type TenantWipeStats,
} from "./wipe-tenant";

export {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
  isColdDemoBaseline,
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

/**
 * Wipe Neon for this tenant (fail-soft), then replace the JSON store with
 * committed Zerodha Batch-02 only (never merge with Groww testing.json).
 * Dual-writes chats + predictions and sets the cold-demo baseline — unless a
 * partner baseline was already on Neon, which is restored after seed (share-out
 * footgun: wipe no longer forces baseline 12→4). weekly_export_count resets.
 * No Zerodha Adapt on this path.
 */
export async function runPartnerDemo(
  options?: PartnerDemoOptions
): Promise<PartnerDemoResult> {
  const tenantId = emptyShowcaseStore.tenant.id;
  const priorBaseline = await snapshotPartnerBaseline(tenantId);

  const report = options?.onProgress;
  await report?.({ step: "wipe", done: 0, total: 1 });
  const wipe = await wipeTenantDataFailSoft(tenantId);
  await report?.({ step: "wipe", done: 1, total: 1 });
  const loaded = await loadZerodhaBatch02IntoStore({
    applyDemoBaseline: true,
    syncPredictions: true,
    onProgress: report,
  });

  let store = loaded.store;
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
    importedConversations: loaded.importedConversations,
    newSignals: loaded.newSignals,
    samples: loaded.samples,
    baselineOpportunities,
    opportunityLift: sioonaOpportunities - baselineOpportunities,
    predictionSync: loaded.predictionSync,
    conversationSync: loaded.conversationSync,
    detectLlm: loaded.detectLlm,
    wipe,
  };
}

/**
 * Wipe Neon for this tenant (fail-soft), then replace the JSON store with
 * Groww testing.json (Reset Demo). Dual-writes chats + predictions. Does not
 * apply the Partner Demo cold-demo baseline. Empty taxonomyOverrides.
 */
export async function runResetDemo(
  options?: PartnerDemoOptions
): Promise<PartnerDemoResult> {
  const tenantId = emptyShowcaseStore.tenant.id;
  const report = options?.onProgress;
  await report?.({ step: "wipe", done: 0, total: 1 });
  const wipe = await wipeTenantDataFailSoft(tenantId);
  await report?.({ step: "wipe", done: 1, total: 1 });
  const loaded = await loadTestingJsonIntoStore({
    applyDemoBaseline: false,
    syncPredictions: true,
    onProgress: report,
  });

  const sioonaOpportunities = new Set(
    loaded.store.signals.map((s) => s.conversationId)
  ).size;
  const baselineOpportunities =
    loaded.store.pilot?.baselineOpportunities ?? 0;

  return {
    store: loaded.store,
    importedConversations: loaded.importedConversations,
    newSignals: loaded.newSignals,
    samples: loaded.samples,
    baselineOpportunities,
    opportunityLift: sioonaOpportunities - baselineOpportunities,
    predictionSync: loaded.predictionSync,
    conversationSync: loaded.conversationSync,
    detectLlm: loaded.detectLlm,
    wipe,
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
