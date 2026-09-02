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
import type { Conversation, Message, Signal } from "./types";

export type DeferredIngestDualWriteInput = {
  tenantId: string;
  conversations: Conversation[];
  messages: Message[];
  signals: Signal[];
  replaceShowcase: boolean;
};

export async function persistDeferredIngestDualWrite(
  input: DeferredIngestDualWriteInput
): Promise<void> {
  const { tenantId, conversations, messages, signals, replaceShowcase } = input;

  const [, { signals: synced }] = await Promise.all([
    syncConversationsToBackend(conversations, messages, tenantId, {
      clearUnlabeledGroundTruth: replaceShowcase,
    }),
    syncPredictionsToBackend(signals, tenantId),
  ]);

  const latest = await readStore();
  if (latest.tenant.id === tenantId) {
    const merged = mergeSyncedBackendIds(latest.signals, synced);
    if (merged !== latest.signals) {
      await writeStore({ ...latest, signals: merged });
    }
  }

  if (replaceShowcase) {
    await pruneConversationsNotInBackend(
      tenantId,
      conversations.map((conversation) => conversation.id)
    );
  }
}
