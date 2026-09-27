/**
 * Bundled Sample / Partner Demo conversation ids.
 * A replace upload must drop these before Neon hydrate paints Insights,
 * or Groww rows stay in the queue beside the new file.
 */

import { promises as fs } from "fs";
import { stableConversationId } from "./ingest";
import { readStore, writeStore } from "./store";
import { isLivePartnerKeepSet } from "./vault-file";
import {
  parseTestingJsonDocument,
  resolveTestingJsonPath,
  resolveZerodhaBatch02Path,
} from "./testing-json-eval";
import type { StoreData } from "./types";

let cachedIds: Promise<Set<string>> | null = null;

function idsFromPack(text: string): string[] {
  const used = new Set<string>();
  return parseTestingJsonDocument(text).map((conversation) =>
    stableConversationId(conversation.externalId, used),
  );
}

/** Stable `conv_*` ids for testing.json and Zerodha Batch-02. Cached. */
export function bundledShowcaseConversationIds(): Promise<Set<string>> {
  if (!cachedIds) {
    cachedIds = (async () => {
      const ids = new Set<string>();
      for (const filePath of [resolveTestingJsonPath(), resolveZerodhaBatch02Path()]) {
        try {
          const text = await fs.readFile(/*turbopackIgnore: true*/ filePath, "utf8");
          for (const id of idsFromPack(text)) ids.add(id);
        } catch {
          // Pack missing in this runtime — nothing from that file to drop.
        }
      }
      return ids;
    })();
  }
  return cachedIds;
}

/**
 * Remove bundled showcase chats from a live partner keep-set.
 * Sample / Partner Demo filenames are left alone — those packs are the keep-set.
 * Returns the same store when nothing changes.
 */
export function omitBundledShowcaseChats(
  store: StoreData,
  showcaseIds: Set<string>,
): StoreData {
  if (!isLivePartnerKeepSet(store.pilot?.lastUploadedFileName)) return store;
  if (showcaseIds.size === 0 || store.conversations.length === 0) return store;
  const conversations = store.conversations.filter(
    (conversation) => !showcaseIds.has(conversation.id),
  );
  if (conversations.length === store.conversations.length) return store;
  const keep = new Set(conversations.map((conversation) => conversation.id));
  return {
    ...store,
    conversations,
    messages: store.messages.filter((message) => keep.has(message.conversationId)),
    signals: store.signals.filter((signal) => keep.has(signal.conversationId)),
    ...(store.supervisedActions
      ? {
          supervisedActions: store.supervisedActions.filter((action) =>
            keep.has(action.conversationId),
          ),
        }
      : {}),
  };
}

/**
 * Drop bundled showcase chats from the latest JSON file.
 * Re-reads first so a label saved while pack ids were loading is kept.
 * Returns null when the latest file has nothing to drop.
 */
export async function persistOmittedBundledShowcase(
  showcaseIds: Set<string>,
): Promise<StoreData | null> {
  const latest = await readStore();
  const omitted = omitBundledShowcaseChats(latest, showcaseIds);
  if (omitted === latest || omitted.conversations.length === 0) return null;
  await writeStore(omitted);
  return omitted;
}
