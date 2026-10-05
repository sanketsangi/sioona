/**
 * Neon dual-write after POST /api/ingest has written JSON.
 * Conversations land before predictions. The route awaits this and
 * surfaces failed counts instead of swallowing them.
 */

import type { LlmPassStats } from "./detect-llm";
import { syncDetectionRun } from "./sync-detection-run";
import { publishIngestUpload } from "./publish-ingest-upload";
import { emptyShowcaseStore } from "@/data/fixtures/sample-store";
import { getPilotSettings, type BackendPilotSettings } from "./backend-client";
import { mergeSyncedBackendIds } from "./defer-prediction-sync";
import { replayAbsentFeedback } from "./replay-absent-feedback";
import { readPersistedStore, writeStore } from "./store";
import {
  pruneConversationsNotInBackend,
  syncConversationsToBackend,
  type ConversationSyncStats,
} from "./sync-conversations";
import { pilotSettingsFromRemote } from "./sync-pilot";
import {
  syncPredictionsToBackend,
  type PredictionSyncStats,
} from "./sync-predictions";
import { ensureSupervisedActions } from "./supervised-actions";
import type { Conversation, Message, Signal, StoreData } from "./types";
import { stampUnstampedSourceFile, vaultFileMatchesKeepSet } from "./vault-file";

export type DeferredIngestDualWriteInput = {
  tenantId: string;
  publishUpload?: boolean;
  versionDetection?: boolean;
  classificationFailed?: boolean;
  skippedIds?: string[];
  contexts?: LlmPassStats["contexts"];
  priorSignals?: Signal[];
  conversations: Conversation[];
  messages: Message[];
  signals: Signal[];
  replaceShowcase: boolean;
  /** `store.pilot.updatedAt` written by this ingest — abort if the store moved on. */
  storeUpdatedAt?: string;
  lastUploadedFileName?: string;
};

export type DeferredIngestSyncResult = {
  predictionSync: PredictionSyncStats;
  conversationSync: ConversationSyncStats;
};

function emptyDeferredSync(): DeferredIngestSyncResult {
  return {
    predictionSync: {
      attempted: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    },
    conversationSync: {
      attempted: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
    },
  };
}

/** True when this after() snapshot still matches the latest JSON store. */
export function ingestDualWriteStillCurrent(
  latest: Pick<StoreData, "tenant" | "pilot" | "conversations">,
  input: Pick<
    DeferredIngestDualWriteInput,
    | "tenantId"
    | "conversations"
    | "replaceShowcase"
    | "storeUpdatedAt"
    | "lastUploadedFileName"
  >
): boolean {
  if (latest.tenant.id !== input.tenantId) return false;
  if (
    input.storeUpdatedAt &&
    latest.pilot?.updatedAt !== input.storeUpdatedAt
  ) {
    return false;
  }
  if (
    input.lastUploadedFileName !== undefined &&
    (latest.pilot?.lastUploadedFileName ?? undefined) !==
      input.lastUploadedFileName
  ) {
    return false;
  }
  const have = new Set(
    latest.conversations.map((conversation) => conversation.id)
  );
  if (input.replaceShowcase) {
    if (have.size !== input.conversations.length) return false;
    return input.conversations.every((conversation) =>
      have.has(conversation.id)
    );
  }
  return input.conversations.every((conversation) =>
    have.has(conversation.id)
  );
}

/**
 * Neon pilot moved to a different file after this ingest. A missing local
 * store must not replay an older snapshot over that newer keep-set.
 * The same filename stays current: this ingest's own PUT is newer than
 * the client `updatedAt` by server clock, and still belongs to this upload.
 */
export function remotePilotSupersedesIngest(
  remote: Pick<
    BackendPilotSettings,
    "last_uploaded_file_name" | "updated_at"
  > | null,
  input: Pick<
    DeferredIngestDualWriteInput,
    "lastUploadedFileName" | "storeUpdatedAt"
  >,
): boolean {
  if (!remote?.updated_at || !input.storeUpdatedAt) return false;
  const remoteMs = Date.parse(remote.updated_at);
  const inputMs = Date.parse(input.storeUpdatedAt);
  if (!Number.isFinite(remoteMs) || !Number.isFinite(inputMs)) return false;
  if (remoteMs <= inputMs) return false;
  const remoteName = remote.last_uploaded_file_name?.trim() ?? "";
  const inputName = input.lastUploadedFileName?.trim() ?? "";
  if (
    inputName &&
    remoteName &&
    vaultFileMatchesKeepSet(remoteName, inputName)
  ) {
    return false;
  }
  return true;
}

async function ingestSupersededOnNeon(
  input: DeferredIngestDualWriteInput,
): Promise<boolean> {
  try {
    const remote = await getPilotSettings(input.tenantId);
    return remotePilotSupersedesIngest(remote, input);
  } catch {
    return false;
  }
}

/** Persist the ingest corpus when this instance never had the JSON file. */
async function writeMissingInstanceSnapshot(
  input: DeferredIngestDualWriteInput,
  signals: Signal[],
): Promise<void> {
  const remote = await getPilotSettings(input.tenantId).catch(() => null);
  const pilot = remote
    ? pilotSettingsFromRemote(remote)
    : {
        baselineOpportunities: 0,
        ...(input.storeUpdatedAt ? { updatedAt: input.storeUpdatedAt } : {}),
        ...(input.lastUploadedFileName
          ? { lastUploadedFileName: input.lastUploadedFileName }
          : {}),
      };
  if (
    input.lastUploadedFileName &&
    !pilot.lastUploadedFileName
  ) {
    pilot.lastUploadedFileName = input.lastUploadedFileName;
  }
  const store: StoreData = {
    ...structuredClone(emptyShowcaseStore),
    tenant: { ...emptyShowcaseStore.tenant, id: input.tenantId },
    conversations: stampUnstampedSourceFile(
      input.conversations,
      input.lastUploadedFileName,
    ),
    messages: input.messages,
    signals,
    taxonomyOverrides: emptyShowcaseStore.taxonomyOverrides ?? {},
    pilot,
  };
  ensureSupervisedActions(store);
  await writeStore(store);
}

export async function persistDeferredIngestDualWrite(
  input: DeferredIngestDualWriteInput
): Promise<DeferredIngestSyncResult> {
  const { tenantId, conversations, messages, signals, replaceShowcase } = input;

  const before = await readPersistedStore();
  if (before) {
    if (!ingestDualWriteStillCurrent(before, input)) return emptyDeferredSync();
  } else if (await ingestSupersededOnNeon(input)) {
    return emptyDeferredSync();
  }

  if (input.versionDetection && input.classificationFailed) throw new Error("Classification failed; no detection revision published.");

  // Conversations first so a Postgres FK from predictions can resolve.
  const conversationSync = await syncConversationsToBackend(
    conversations,
    messages,
    tenantId,
    { clearUnlabeledGroundTruth: replaceShowcase },
  );
  if (input.versionDetection && (conversationSync.failed > 0 || conversationSync.skipped > 0)) throw new Error("Conversation sync incomplete; no detection revision published.");
  const { signals: synced, sync: predictionSync } =
    input.versionDetection && conversationSync.failed === 0 && conversationSync.skipped === 0
      ? await syncDetectionRun({ tenantId, conversations, messages, signals, contexts: input.contexts, skippedIds: input.skippedIds, priorSignals: input.priorSignals })
      : await syncPredictionsToBackend(signals, tenantId);

  const latest = await readPersistedStore();
  if (latest && !ingestDualWriteStillCurrent(latest, input)) {
    return { predictionSync, conversationSync };
  }

  const ingestedIds = new Set(conversations.map((conversation) => conversation.id));
  const merged = input.versionDetection
    ? [...(latest ? latest.signals : signals).filter((signal) => !ingestedIds.has(signal.conversationId)), ...synced]
    : mergeSyncedBackendIds(latest ? latest.signals : signals, synced);
  if (!latest) {
    if (replaceShowcase) await writeMissingInstanceSnapshot(input, merged);
  } else if (merged !== latest.signals) {
    await writeStore({ ...latest, signals: merged });
  }
  await replayAbsentFeedback(tenantId, merged);

  // A partial sync cannot authorize deletion of the previously durable corpus.
  if (
    conversationSync.failed > 0 || conversationSync.skipped > 0 ||
    predictionSync.failed > 0 || predictionSync.skipped > 0
  ) return { predictionSync, conversationSync };

  if (input.publishUpload) {
    await publishIngestUpload({ tenantId, conversations, messages,
      source: input.lastUploadedFileName ?? "upload", replace: replaceShowcase });
    // Historical corpus and feedback remain available through immutable uploads.
    return { predictionSync, conversationSync };
  }

  if (!replaceShowcase) return { predictionSync, conversationSync };

  // Reset / a later ingest can land after the heal check.
  // A missing file is a different instance — still prune the replaced pack.
  const prePrune = await readPersistedStore();
  if (prePrune && !ingestDualWriteStillCurrent(prePrune, input)) {
    return { predictionSync, conversationSync };
  }
  if (!prePrune && (await ingestSupersededOnNeon(input))) {
    return { predictionSync, conversationSync };
  }

  await pruneConversationsNotInBackend(
    tenantId,
    conversations.map((conversation) => conversation.id)
  );
  return { predictionSync, conversationSync };
}
