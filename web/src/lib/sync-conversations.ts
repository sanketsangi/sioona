/**
 * Dual-write conversations + messages to FastAPI / Neon.
 * Best-effort with multi-retry + short backoff; failures must not break
 * ingest / Partner Demo (same pattern as sync-predictions.ts).
 */

import { upsertConversations } from "./backend-client";
import type { Conversation, Message } from "./types";

/** Initial try + this many retries on transient failure. */
export const CONVERSATION_SYNC_MAX_RETRIES = 2;
/** Total attempts = 1 + CONVERSATION_SYNC_MAX_RETRIES. */
export const CONVERSATION_SYNC_MAX_ATTEMPTS = 1 + CONVERSATION_SYNC_MAX_RETRIES;
/** Backoff after each failed attempt (ms), before the next try. */
export const CONVERSATION_SYNC_BACKOFF_MS = [200, 800] as const;

export type ConversationSyncStats = {
  attempted: number;
  created: number;
  updated: number;
  failed: number;
  skipped: number;
  messagesCreated: number;
  messagesUpdated: number;
};

export type SyncConversationsOptions = {
  /** Injectable for tests; defaults to real setTimeout sleep. */
  sleep?: (ms: number) => Promise<void>;
};

async function defaultSleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export function emptyConversationSyncStats(): ConversationSyncStats {
  return {
    attempted: 0,
    created: 0,
    updated: 0,
    failed: 0,
    skipped: 0,
    messagesCreated: 0,
    messagesUpdated: 0,
  };
}

export function toConversationSyncPayload(
  conversations: Conversation[],
  messages: Message[]
) {
  const byConv = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byConv.get(message.conversationId) ?? [];
    list.push(message);
    byConv.set(message.conversationId, list);
  }
  return conversations.map((conversation) => ({
    conversation_id: conversation.id,
    channel: conversation.channel,
    customer_name: conversation.customerName ?? null,
    started_at: conversation.startedAt,
    external_id: conversation.externalId ?? null,
    messages: (byConv.get(conversation.id) ?? []).map((message) => ({
      message_id: message.id,
      role: message.role,
      content: message.content,
      timestamp: message.timestamp,
    })),
  }));
}

async function upsertConversationsWithRetry(
  tenantId: string,
  conversations: Conversation[],
  messages: Message[],
  sleep: (ms: number) => Promise<void>
) {
  const payload = toConversationSyncPayload(conversations, messages);
  let lastError: unknown;
  for (let attempt = 0; attempt < CONVERSATION_SYNC_MAX_ATTEMPTS; attempt++) {
    try {
      return await upsertConversations(tenantId, payload);
    } catch (err) {
      lastError = err;
      if (attempt < CONVERSATION_SYNC_MAX_ATTEMPTS - 1) {
        const delay =
          CONVERSATION_SYNC_BACKOFF_MS[
            Math.min(attempt, CONVERSATION_SYNC_BACKOFF_MS.length - 1)
          ] ?? CONVERSATION_SYNC_BACKOFF_MS[CONVERSATION_SYNC_BACKOFF_MS.length - 1];
        await sleep(delay);
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("upsertConversations failed after retries");
}

/**
 * Upsert chats to Neon. Fail-soft: never throws; callers keep the JSON store.
 */
export async function syncConversationsToBackend(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  options?: SyncConversationsOptions
): Promise<ConversationSyncStats> {
  if (conversations.length === 0) {
    return emptyConversationSyncStats();
  }

  const sleep = options?.sleep ?? defaultSleep;
  try {
    const result = await upsertConversationsWithRetry(
      tenantId,
      conversations,
      messages,
      sleep
    );
    return {
      attempted: conversations.length,
      created: result.created,
      updated: result.updated,
      failed: 0,
      skipped: 0,
      messagesCreated: result.messages_created,
      messagesUpdated: result.messages_updated,
    };
  } catch (err) {
    const detail = err instanceof Error ? err.message : "unknown error";
    console.warn(
      `[sync-conversations] upsert failed tenant=${tenantId} conversations=${conversations.length}: ${detail}`
    );
    return {
      attempted: conversations.length,
      created: 0,
      updated: 0,
      failed: conversations.length,
      skipped: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
    };
  }
}
