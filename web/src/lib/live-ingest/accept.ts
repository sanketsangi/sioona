/**
 * Append redacted chats and run the existing detection pipeline.
 * Read-only toward the customer: no outbound message is sent.
 */

import { persistDeferredIngestDualWrite } from "../defer-ingest-sync";
import type { DeferredIngestDualWriteInput } from "../defer-ingest-sync";
import { runHybridDetection } from "../detect-llm";
import { toStoreRecords } from "../ingest";
import type { IngestConversationInput } from "../ingest-platforms";
import { readStore, writeStore } from "../store";
import type { StoreData } from "../types";

type LiveIngestDeps = {
  read?: () => Promise<StoreData>;
  write?: (store: StoreData) => Promise<void>;
  detect?: typeof runHybridDetection;
  dualWrite?: (input: DeferredIngestDualWriteInput) => Promise<void>;
};

let liveIngestTail: Promise<void> = Promise.resolve();

/** One webhook at a time so two JSON writes cannot drop each other's chats. */
function withLiveIngestLock<T>(task: () => Promise<T>): Promise<T> {
  const run = liveIngestTail.then(task, task);
  liveIngestTail = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function acceptLiveChatsBody(
  inputs: IngestConversationInput[],
  deps: LiveIngestDeps,
): Promise<{ accepted: number }> {
  const read = deps.read ?? readStore;
  const write = deps.write ?? writeStore;
  const detect = deps.detect ?? runHybridDetection;
  const dualWrite = deps.dualWrite ?? persistDeferredIngestDualWrite;
  const store = await read();
  const seen = new Set(
    store.conversations
      .map((conversation) => conversation.externalId)
      .filter((id): id is string => Boolean(id)),
  );
  const fresh = inputs.filter(
    (input) => input.externalId && !seen.has(input.externalId),
  );
  if (fresh.length === 0) return { accepted: 0 };

  const ingested = toStoreRecords(fresh, store.tenant.id, { stableIds: true });
  store.conversations.push(...ingested.conversations);
  store.messages.push(...ingested.messages);
  const { signals, llm } = await detect(
    ingested.conversations,
    ingested.messages,
    store.tenant.id,
    store.taxonomyOverrides,
    { resumeIds: store.llmSkippedConversationIds },
  );
  store.signals.push(...signals);
  if (llm.enabled) {
    const batchIds = new Set(ingested.conversations.map((row) => row.id));
    const prior = (store.llmSkippedConversationIds ?? []).filter(
      (id) => !batchIds.has(id),
    );
    const skipped = (llm.skippedIds ?? []).filter((id) => !prior.includes(id));
    store.llmSkippedConversationIds = [...prior, ...skipped];
  }
  await write(store);
  try {
    await dualWrite({
      tenantId: store.tenant.id,
      conversations: ingested.conversations,
      messages: ingested.messages,
      signals,
      replaceShowcase: false,
      storeUpdatedAt: store.pilot?.updatedAt,
      lastUploadedFileName: store.pilot?.lastUploadedFileName,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    console.warn(`[live-ingest] dual-write failed: ${detail}`);
  }
  return { accepted: ingested.conversations.length };
}

export async function acceptLiveChats(
  inputs: IngestConversationInput[],
  deps: LiveIngestDeps = {},
): Promise<{ accepted: number }> {
  return withLiveIngestLock(() => acceptLiveChatsBody(inputs, deps));
}
