import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { loadTestingJsonIntoStore } from "./load-testing-json-store";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
} from "./demo-baseline";
import type { LlmPassStats } from "./detect-llm";
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

/**
 * Wipe Neon for this tenant (fail-soft), then load testing.json showcase corpus,
 * dual-write chats + predictions, and set the cold-demo baseline so lift /
 * “missed opportunities” is visible immediately. No Adapt on this path.
 */
export async function runPartnerDemo(): Promise<PartnerDemoResult> {
  const wipe = await wipeTenantDataFailSoft(emptyShowcaseStore.tenant.id);
  const loaded = await loadTestingJsonIntoStore({
    applyDemoBaseline: true,
    syncPredictions: true,
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
