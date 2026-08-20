import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { loadZerodhaBatch02IntoStore } from "./load-testing-json-store";
import {
  DEMO_BASELINE_OPPORTUNITIES,
} from "./demo-baseline";
import type { LlmPassStats } from "./detect-llm";
import type {
  PartnerDemoCompleteEvent,
  PartnerDemoProgress,
} from "./partner-demo-progress";
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

/**
 * Wipe Neon for this tenant (fail-soft), then replace the JSON store with
 * committed Zerodha Batch-02 only (never merge with Groww testing.json).
 * Dual-writes chats + predictions and sets the cold-demo baseline.
 * No Zerodha Adapt on this path.
 */
export async function runPartnerDemo(
  options?: PartnerDemoOptions
): Promise<PartnerDemoResult> {
  const report = options?.onProgress;
  await report?.({ step: "wipe", done: 0, total: 1 });
  const wipe = await wipeTenantDataFailSoft(emptyShowcaseStore.tenant.id);
  await report?.({ step: "wipe", done: 1, total: 1 });
  const loaded = await loadZerodhaBatch02IntoStore({
    applyDemoBaseline: true,
    syncPredictions: true,
    onProgress: report,
  });

  const sioonaOpportunities = new Set(
    loaded.store.signals.map((s) => s.conversationId)
  ).size;

  return {
    store: loaded.store,
    importedConversations: loaded.importedConversations,
    newSignals: loaded.newSignals,
    samples: loaded.samples,
    baselineOpportunities: DEMO_BASELINE_OPPORTUNITIES,
    opportunityLift: sioonaOpportunities - DEMO_BASELINE_OPPORTUNITIES,
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
