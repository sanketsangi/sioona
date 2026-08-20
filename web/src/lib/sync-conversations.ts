/**
 * Dual-write conversations + messages to FastAPI / Neon.
 * Best-effort with multi-retry + short backoff; failures must not break
 * ingest / Partner Demo (same pattern as sync-predictions.ts).
 */

import {
  BackendClientError,
  pruneConversations,
  upsertConversations,
  type BackendConversationInput,
  type BackendGroundTruth,
} from "./backend-client";
import type { Conversation, Message } from "./types";

const GROUND_TRUTH_LABELS = new Set<BackendGroundTruth>([
  "lead",
  "retention",
  "upsell",
  "none",
]);

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
  /** Day-1 replace: unlabeled file chats clear leftover Neon GT. */
  clearUnlabeledGroundTruth?: boolean;
  /** Real chunk ticks: 0 then N after each bulk upsert. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
};

export type ConversationPruneStats = {
  deleted: number;
  kept: number;
  skipped: boolean;
  reason?: "not_supported" | "backend_unavailable";
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
  messages: Message[],
  options?: Pick<SyncConversationsOptions, "clearUnlabeledGroundTruth">
): BackendConversationInput[] {
  const byConv = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byConv.get(message.conversationId) ?? [];
    list.push(message);
    byConv.set(message.conversationId, list);
  }
  return conversations.map((conversation) => {
    const payload: BackendConversationInput = {
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
    };
    const groundTruth = conversation.groundTruth;
    if (groundTruth && GROUND_TRUTH_LABELS.has(groundTruth)) {
      payload.ground_truth = groundTruth;
    } else if (options?.clearUnlabeledGroundTruth) {
      payload.clear_ground_truth = true;
    }
    return payload;
  });
}

/** Chunk size for /v1/conversations/bulk — Neon ~5–9s/chat; keep under client timeout. */
export const CONVERSATION_SYNC_CHUNK_SIZE = 5;

async function upsertConversationChunkWithRetry(
  tenantId: string,
  payload: BackendConversationInput[],
  sleep: (ms: number) => Promise<void>
) {
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

async function upsertConversationsWithRetry(
  tenantId: string,
  conversations: Conversation[],
  messages: Message[],
  sleep: (ms: number) => Promise<void>,
  options?: Pick<
    SyncConversationsOptions,
    "clearUnlabeledGroundTruth" | "onProgress"
  >
) {
  const payload = toConversationSyncPayload(conversations, messages, options);
  let created = 0;
  let updated = 0;
  let messages_created = 0;
  let messages_updated = 0;

  for (let i = 0; i < payload.length; i += CONVERSATION_SYNC_CHUNK_SIZE) {
    const chunk = payload.slice(i, i + CONVERSATION_SYNC_CHUNK_SIZE);
    const result = await upsertConversationChunkWithRetry(
      tenantId,
      chunk,
      sleep
    );
    created += result.created;
    updated += result.updated;
    messages_created += result.messages_created;
    messages_updated += result.messages_updated;
    await options?.onProgress?.(
      Math.min(i + chunk.length, payload.length),
      payload.length
    );
  }

  return { created, updated, messages_created, messages_updated };
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
  await options?.onProgress?.(0, conversations.length);
  if (conversations.length === 0) {
    return emptyConversationSyncStats();
  }

  const sleep = options?.sleep ?? defaultSleep;
  try {
    const result = await upsertConversationsWithRetry(
      tenantId,
      conversations,
      messages,
      sleep,
      options
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

/**
 * After a replace ingest: drop Neon conversation_ids not in this file.
 * Fail-soft — 404 (old API) or network errors must not fail JSON replace.
 */
export async function pruneConversationsNotInBackend(
  tenantId: string,
  keepConversationIds: string[]
): Promise<ConversationPruneStats> {
  try {
    const result = await pruneConversations(tenantId, keepConversationIds);
    return {
      deleted: result.deleted,
      kept: result.kept,
      skipped: false,
    };
  } catch (err) {
    const status = err instanceof BackendClientError ? err.status : undefined;
    const reason =
      status === 404 ? "not_supported" : "backend_unavailable";
    const detail = err instanceof Error ? err.message : "unknown error";
    console.warn(
      `[sync-conversations] prune skipped tenant=${tenantId} reason=${reason}: ${detail}`
    );
    return {
      deleted: 0,
      kept: keepConversationIds.length,
      skipped: true,
      reason,
    };
  }
}
