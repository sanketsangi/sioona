import { getPublishedConversationIds } from "../backend-client";
import { publishAtomicIngest } from "../publish-atomic-ingest";
import { opaqueExternalIdentity } from "../opaque-identity";
/**
 * Append redacted chats and run the existing detection pipeline.
 * Read-only toward the customer: no outbound message is sent.
 */

import { persistDeferredIngestDualWrite } from "../defer-ingest-sync";
import type { DeferredIngestDualWriteInput } from "../defer-ingest-sync";
import { runHybridDetection } from "../detect-llm";
import { withDetectionLedger } from "../ai/ledger";
import { toStoreRecords } from "../ingest";
import type { IngestConversationInput } from "../ingest-platforms";
import { readStore, writeStore } from "../store";
import type { StoreData } from "../types";

type LiveIngestDeps = {
  read?: () => Promise<StoreData>;
  write?: (store: StoreData) => Promise<void>;
  detect?: typeof runHybridDetection;
  publish?: typeof publishAtomicIngest;
  publishedIds?: typeof getPublishedConversationIds;
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
  const priorStore = await read();
  const store = { ...priorStore, conversations: [...priorStore.conversations],
    messages: [...priorStore.messages], signals: [...priorStore.signals] };
  const seen = new Set(
    store.conversations
      .map((conversation) => conversation.externalId)
      .filter((id): id is string => Boolean(id)),
  );
  const fresh = inputs.filter((input) => {
    if (!input.externalId) return false;
    const identity = store.tenant.id === "tenant_demo" ? input.externalId
      : `ext_${opaqueExternalIdentity(store.tenant.id, input.channel ?? "upload", input.externalId)}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
  if (fresh.length === 0) return { accepted: 0 };

  let ingested = toStoreRecords(fresh, store.tenant.id, { stableIds: true });
  if (store.tenant.id !== "tenant_demo") {
    const published = new Set<string>();
    const ids = ingested.conversations.map((chat) => chat.id);
    for (let offset = 0; offset < ids.length; offset += 50) {
      for (const id of await (deps.publishedIds ?? getPublishedConversationIds)(store.tenant.id, ids.slice(offset, offset + 50))) published.add(id);
    }
    ingested = { conversations: ingested.conversations.filter((chat) => !published.has(chat.id)),
      messages: ingested.messages.filter((message) => !published.has(message.conversationId)) };
    if (!ingested.conversations.length) return { accepted: 0 };
  }
  store.conversations.push(...ingested.conversations);
  store.messages.push(...ingested.messages);
  const { signals, llm, partnerPublished } = await withDetectionLedger(store.tenant.id, async (ledger) => {
    const detected = await detect(
      ingested.conversations,
      ingested.messages,
      store.tenant.id,
      store.taxonomyOverrides,
      { resumeIds: [...new Set([...(store.llmFailedConversationIds ?? []), ...(store.llmSkippedConversationIds ?? [])])],
        ...ledger.detectOptions },
    );
    if (store.tenant.id !== "tenant_demo") {
      const publishedRows = await (deps.publish ?? publishAtomicIngest)({ tenantId: store.tenant.id,
        source: "live-ingest", replace: false, appendOnly: true, conversations: ingested.conversations,
        messages: ingested.messages, signals: detected.signals, contexts: detected.llm.contexts,
        classificationFailed: detected.llm.failed > 0, skippedIds: detected.llm.skippedIds,
        onDetectionRunId: ledger.setDetectionRunId });
      return { signals: publishedRows.signals, llm: detected.llm, partnerPublished: true };
    }
    return { signals: detected.signals, llm: detected.llm, partnerPublished: false };
  });
  if (partnerPublished) {
    store.signals.push(...signals);
    try { await write(store); }
    catch { console.warn("[live-ingest] batch stored; local cache refresh failed"); }
    return { accepted: ingested.conversations.length };
  }
  store.signals.push(...signals);
  if (llm.enabled) {
    const batchIds = new Set(ingested.conversations.map((row) => row.id));
    const prior = (store.llmSkippedConversationIds ?? []).filter(
      (id) => !batchIds.has(id),
    );
    const skipped = (llm.skippedIds ?? []).filter((id) => !prior.includes(id));
    store.llmSkippedConversationIds = [...prior, ...skipped];
    store.llmFailedConversationIds = [...new Set([...(store.llmFailedConversationIds ?? []).filter((id) => !batchIds.has(id)), ...(llm.failedIds ?? [])])];
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
