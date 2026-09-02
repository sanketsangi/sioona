/**
 * Off-TTFB dual-write after POST /api/ingest.
 * JSON already has chats + newSignals; this upserts Neon so needs-review
 * eventually matches. Fail-soft — Insights paints JSON-only rows meanwhile.
 */

import { mergeSyncedBackendIds } from "./defer-prediction-sync";
import { readStore, writeStore } from "./store";
import {
  pruneConversationsNotInBackend,
  syncConversationsToBackend,
} from "./sync-conversations";
import { syncPredictionsToBackend } from "./sync-predictions";
import type { Conversation, Message, Signal, StoreData } from "./types";

export type DeferredIngestDualWriteInput = {
  tenantId: string;
  conversations: Conversation[];
  messages: Message[];
  signals: Signal[];
  replaceShowcase: boolean;
  /** `store.pilot.updatedAt` written by this ingest — abort if the store moved on. */
  storeUpdatedAt?: string;
  lastUploadedFileName?: string;
};

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

export async function persistDeferredIngestDualWrite(
  input: DeferredIngestDualWriteInput
): Promise<void> {
  const { tenantId, conversations, messages, signals, replaceShowcase } = input;

  const before = await readStore();
  if (!ingestDualWriteStillCurrent(before, input)) return;

  const [, { signals: synced }] = await Promise.all([
    syncConversationsToBackend(conversations, messages, tenantId, {
      clearUnlabeledGroundTruth: replaceShowcase,
    }),
    syncPredictionsToBackend(signals, tenantId),
  ]);

  const latest = await readStore();
  if (!ingestDualWriteStillCurrent(latest, input)) return;

  const merged = mergeSyncedBackendIds(latest.signals, synced);
  if (merged !== latest.signals) {
    await writeStore({ ...latest, signals: merged });
  }

  if (!replaceShowcase) return;

  // writeStore / Reset / a later ingest can land after the heal check.
  // Re-read immediately before prune so a stale keep-list cannot delete
  // the current pack from Neon.
  const prePrune = await readStore();
  if (!ingestDualWriteStillCurrent(prePrune, input)) return;

  await pruneConversationsNotInBackend(
    tenantId,
    conversations.map((conversation) => conversation.id)
  );
}
