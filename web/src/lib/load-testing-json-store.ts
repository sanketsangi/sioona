import { promises as fs } from "fs";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { runHybridDetectionWithLedger } from "./ai/run-with-ledger";
import type { LlmPassStats } from "./detect-llm";
import { toStoreRecords } from "./ingest";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
} from "./demo-baseline";
import { writeStore } from "./store";
import type { PartnerDemoStep } from "./partner-demo-progress";
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
  GROWW_SHOWCASE_SAMPLE_NAME,
  ZERODHA_BATCH02_SAMPLE_NAME,
  parseTestingJsonDocument,
  resolveTestingJsonPath,
  resolveZerodhaBatch02Path,
} from "./testing-json-eval";
import type { StoreData } from "./types";

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
  /** Real pipeline ticks (detect → sync chats → sync signals). */
  onProgress?: (event: {
    step: Exclude<PartnerDemoStep, "wipe">;
    done: number;
    total: number;
  }) => void | Promise<void>;
}

interface LoadShowcaseJsonOptions extends LoadTestingJsonOptions {
  sampleName: string;
  resolvePath: (repoRoot?: string) => string;
}

/**
 * Replace the JSON store with one labeled JSON corpus (wipe is the caller’s job).
 * Uses empty taxonomyOverrides — no Adapt on this path.
 */
async function loadShowcaseJsonIntoStore(
  options: LoadShowcaseJsonOptions
): Promise<LoadTestingJsonResult> {
  const absolutePath =
    options.absolutePath ?? options.resolvePath(options.repoRoot);
  const content = await fs.readFile(/*turbopackIgnore: true*/ absolutePath, "utf8");
  const inputs = parseTestingJsonDocument(content);

  const tenantId = emptyShowcaseStore.tenant.id;
  const { conversations, messages } = toStoreRecords(inputs, tenantId, {
    stableIds: true,
  });
  const report = options.onProgress;
  const { signals, llm } = await runHybridDetectionWithLedger(
    conversations,
    messages,
    tenantId,
    emptyShowcaseStore.taxonomyOverrides,
    report
      ? {
          onProgress: (done, total) =>
            report({ step: "detect", done, total }),
        }
      : undefined
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

  if (report) {
    if (options.syncConversations !== false) {
      conversationSync = await syncConversationsToBackend(
        store.conversations,
        store.messages,
        store.tenant.id,
        {
          ...testSleep,
          onProgress: (done, total) =>
            report({ step: "sync_chats", done, total }),
        }
      );
    }
    if (options.syncPredictions !== false) {
      const synced = await syncPredictionsToBackend(
        store.signals,
        store.tenant.id,
        {
          ...testSleep,
          onProgress: (done, total) =>
            report({ step: "sync_signals", done, total }),
        }
      );
      store.signals = synced.signals;
      predictionSync = synced.sync;
    }
  } else {
    const syncJobs: Promise<void>[] = [];
    if (options.syncConversations !== false) {
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
    if (options.syncPredictions !== false) {
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
  }

  if (options.applyDemoBaseline) {
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
    lastUploadedFileName: options.sampleName,
  };

  await writeStore(store);

  if (store.pilot) {
    await syncPilotSettingsToBackend(store.tenant.id, store.pilot);
  }

  return {
    store,
    importedConversations: conversations.length,
    newSignals: signals.length,
    samples: [options.sampleName],
    absolutePath,
    predictionSync,
    conversationSync,
    detectLlm: llm,
  };
}

/**
 * Load Groww testing.json into the JSON store:
 * parse → toStoreRecords → detect → optional dual-write → writeStore.
 * Used by cold open (no wipe) and resetStore (wipe then seed). Not Partner Demo.
 */
export async function loadTestingJsonIntoStore(
  options?: LoadTestingJsonOptions
): Promise<LoadTestingJsonResult> {
  return loadShowcaseJsonIntoStore({
    ...options,
    sampleName: GROWW_SHOWCASE_SAMPLE_NAME,
    resolvePath: resolveTestingJsonPath,
  });
}

/**
 * Load committed Zerodha Batch-02 JSON into the JSON store (replace, not merge).
 * Used by Run Partner Demo after a Neon wipe. Does not apply Zerodha Adapt.
 */
export async function loadZerodhaBatch02IntoStore(
  options?: LoadTestingJsonOptions
): Promise<LoadTestingJsonResult> {
  return loadShowcaseJsonIntoStore({
    ...options,
    sampleName: ZERODHA_BATCH02_SAMPLE_NAME,
    resolvePath: resolveZerodhaBatch02Path,
  });
}
