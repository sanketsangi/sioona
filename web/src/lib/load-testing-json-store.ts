import { promises as fs } from "fs";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { runDetection } from "./detect";
import { toStoreRecords } from "./ingest";
import {
  DEMO_BASELINE_NOTE,
  DEMO_BASELINE_OPPORTUNITIES,
} from "./demo-baseline";
import { writeStore } from "./store";
import {
  syncPredictionsToBackend,
  type PredictionSyncStats,
} from "./sync-predictions";
import {
  parseTestingJsonDocument,
  resolveTestingJsonPath,
} from "./testing-json-eval";
import type { StoreData } from "./types";

const SHOWCASE_SAMPLE_NAME = "testing.json";

export interface LoadTestingJsonResult {
  store: StoreData;
  importedConversations: number;
  newSignals: number;
  samples: string[];
  absolutePath: string;
  predictionSync: PredictionSyncStats;
}

export interface LoadTestingJsonOptions {
  /** Apply cold-demo baseline for lift / missed opportunities. */
  applyDemoBaseline?: boolean;
  /** Dual-write predictions to FastAPI (default true). */
  syncPredictions?: boolean;
  repoRoot?: string;
  absolutePath?: string;
}

/**
 * Load the showcase corpus (testing.json) into the JSON store:
 * parse → toStoreRecords → detect → optional dual-write → writeStore.
 * Used by cold open / resetStore and Run Partner Demo.
 */
export async function loadTestingJsonIntoStore(
  options?: LoadTestingJsonOptions
): Promise<LoadTestingJsonResult> {
  const absolutePath =
    options?.absolutePath ?? resolveTestingJsonPath(options?.repoRoot);
  const content = await fs.readFile(absolutePath, "utf8");
  const inputs = parseTestingJsonDocument(content);

  const tenantId = emptyShowcaseStore.tenant.id;
  const { conversations, messages } = toStoreRecords(inputs, tenantId);
  const signals = runDetection(
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
    failed: 0,
    skipped: 0,
  };

  if (options?.syncPredictions !== false) {
    const synced = await syncPredictionsToBackend(
      store.signals,
      store.tenant.id,
      process.env.VITEST ? { sleep: async () => undefined } : undefined
    );
    store.signals = synced.signals;
    predictionSync = synced.sync;
  }

  if (options?.applyDemoBaseline) {
    store.pilot = {
      baselineOpportunities: DEMO_BASELINE_OPPORTUNITIES,
      baselineNote: DEMO_BASELINE_NOTE,
      updatedAt: new Date().toISOString(),
    };
  }

  await writeStore(store);

  return {
    store,
    importedConversations: conversations.length,
    newSignals: signals.length,
    samples: [SHOWCASE_SAMPLE_NAME],
    absolutePath,
    predictionSync,
  };
}
