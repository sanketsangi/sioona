/**
 * Append redacted chats and run the existing detection pipeline.
 * Read-only toward the customer: no outbound message is sent.
 */

import { runHybridDetection } from "../detect-llm";
import { toStoreRecords } from "../ingest";
import type { IngestConversationInput } from "../ingest-platforms";
import { readStore, writeStore } from "../store";
import type { StoreData } from "../types";

export async function acceptLiveChats(
  inputs: IngestConversationInput[],
  deps: {
    read?: () => Promise<StoreData>;
    write?: (store: StoreData) => Promise<void>;
    detect?: typeof runHybridDetection;
  } = {},
): Promise<{ accepted: number }> {
  const read = deps.read ?? readStore;
  const write = deps.write ?? writeStore;
  const detect = deps.detect ?? runHybridDetection;
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
  const { signals } = await detect(
    ingested.conversations,
    ingested.messages,
    store.tenant.id,
    store.taxonomyOverrides,
  );
  store.signals.push(...signals);
  await write(store);
  return { accepted: ingested.conversations.length };
}
