import { promises as fs } from "fs";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import {
  runHybridDetection,
  type LlmPassStats,
} from "./detect-llm";
import { toStoreRecords } from "./ingest";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
} from "./demo-baseline";
import { writeStore } from "./store";
import {
  emptyConversationSyncStats,
  syncConversationsToBackend,
  type ConversationSyncStats,
} from "./sync-conversations";
import {
  syncPredictionsToBackend,
  type PredictionSyncStats,
} from "./sync-predictions";
import { syncPilotSettingsToBackend } from "./sync-pilot";
import {
  parseTestingJsonDocument,
  resolveTestingJsonPath,
} from "./testing-json-eval";
import type { StoreData } from "./types";

const SHOWCASE_SAMPLE_NAME = "Groww_batch_02";

export interface LoadTestingJsonResult {
  store: StoreData;
  importedConversations: number;
  newSignals: number;
  samples: string[];
  absolutePath: string;
  predictionSync: PredictionSyncStats;
  conversationSync: ConversationSyncStats;
  detectLlm: LlmPassStats;
}

export interface LoadTestingJsonOptions {
  /** Apply cold-demo baseline for lift / missed opportunities. */
  applyDemoBaseline?: boolean;
  /** Dual-write predictions to FastAPI (default true). */
  syncPredictions?: boolean;
  /** Dual-write conversations + messages to FastAPI (default true). */
  syncConversations?: boolean;
  repoRoot?: string;
  absolutePath?: string;
  /** Breadcrumb / `samples[]` name (default Groww showcase). */
  sampleName?: string;
}

/**
 * Load a Sioona-shaped JSON corpus into the store:
 * parse → toStoreRecords → detect → optional dual-write (chats + predictions) → writeStore.
 * Cold open / reset default to testing.json; Partner Demo passes zerodha_batch_02.json.
 */
export async function loadTestingJsonIntoStore(
  options?: LoadTestingJsonOptions
): Promise<LoadTestingJsonResult> {
  const sampleName = options?.sampleName ?? SHOWCASE_SAMPLE_NAME;
  const absolutePath =
    options?.absolutePath ?? resolveTestingJsonPath(options?.repoRoot);
  const content = await fs.readFile(absolutePath, "utf8");
  const inputs = parseTestingJsonDocument(content);

  const tenantId = emptyShowcaseStore.tenant.id;
  const { conversations, messages } = toStoreRecords(inputs, tenantId, {
    stableIds: true,
  });
  const { signals, llm } = await runHybridDetection(
    conversations,
    messages,
    tenantId,
    emptyShowcaseStore.taxonomyOverrides
  );

  const store: StoreData = {
    ...structuredClone(emptyShowcaseStore),
    conversations,
    messages,
    signals,
  };

  let predictionSync: PredictionSyncStats = {
    attempted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
  };
  let conversationSync: ConversationSyncStats = emptyConversationSyncStats();
  const testSleep = process.env.VITEST
    ? { sleep: async () => undefined }
    : undefined;

  const syncJobs: Promise<void>[] = [];
  if (options?.syncConversations !== false) {
    syncJobs.push(
      syncConversationsToBackend(
        store.conversations,
        store.messages,
        store.tenant.id,
        testSleep
      ).then((stats) => {
        conversationSync = stats;
      })
    );
  }
  if (options?.syncPredictions !== false) {
    syncJobs.push(
      syncPredictionsToBackend(store.signals, store.tenant.id, testSleep).then(
        (synced) => {
          store.signals = synced.signals;
          predictionSync = synced.sync;
        }
      )
    );
  }
  await Promise.all(syncJobs);

  if (options?.applyDemoBaseline) {
    store.pilot = {
      baselineOpportunities: DEMO_BASELINE_OPPORTUNITIES,
      baselineNote: DEMO_BASELINE_NOTE,
      updatedAt: new Date().toISOString(),
    };
  }

  // Populate breadcrumb + “last uploaded” chrome for showcase resets.
  // `StoreData.pilot` is optional, so spreading it would make
  // `baselineOpportunities` optional and fail `next build` typecheck.
  store.pilot = {
    ...store.pilot,
    baselineOpportunities: store.pilot?.baselineOpportunities ?? 0,
    lastUploadedFileName: sampleName,
  };

  await writeStore(store);

  if (store.pilot) {
    await syncPilotSettingsToBackend(store.tenant.id, store.pilot);
  }

  return {
    store,
    importedConversations: conversations.length,
    newSignals: signals.length,
    samples: [sampleName],
    absolutePath,
    predictionSync,
    conversationSync,
    detectLlm: llm,
  };
}
