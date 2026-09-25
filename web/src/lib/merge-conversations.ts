import { stableConversationId } from "./ingest";
import type { Conversation, Message } from "./types";

export type ConversationRecords = {
  conversations: Conversation[];
  messages: Message[];
};

export type MergeConversationsResult = ConversationRecords & {
  replacedIds: string[];
  addedIds: string[];
};

function normalizeExternalId(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function remappedMessages(
  incomingMessages: Message[],
  keepId: string
): Message[] {
  return incomingMessages.map((message, index) => ({
    ...message,
    id: `msg_${keepId}_${index}`,
    conversationId: keepId,
  }));
}

/**
 * Upsert incoming conversations into the JSON store by externalId.
 * Match: existing.externalId, then existing.id === incoming.id or
 * stableConversationId(incoming.externalId). On match, keep existing.id
 * (Neon + SignalScore join) and replace that conversation's messages.
 * Conversations not in the incoming set are left untouched.
 */
export function mergeConversationsByExternalId(
  existing: ConversationRecords,
  incoming: ConversationRecords
): MergeConversationsResult {
  const conversations = existing.conversations.map((conversation) => ({
    ...conversation,
    messageIds: [...conversation.messageIds],
  }));
  const messagesByConversation = new Map<string, Message[]>();
  for (const message of existing.messages) {
    const list = messagesByConversation.get(message.conversationId) ?? [];
    list.push(message);
    messagesByConversation.set(message.conversationId, list);
  }

  const incomingMessagesByConversation = new Map<string, Message[]>();
  for (const message of incoming.messages) {
    const list =
      incomingMessagesByConversation.get(message.conversationId) ?? [];
    list.push(message);
    incomingMessagesByConversation.set(message.conversationId, list);
  }

  // Indexes for O(1) match (skip claimed rows via Sets on ids).
  const byExternalId = new Map<string, number>();
  const byId = new Map<string, number>();
  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i];
    byId.set(conversation.id, i);
    const externalId = normalizeExternalId(conversation.externalId);
    if (externalId && !byExternalId.has(externalId)) {
      byExternalId.set(externalId, i);
    }
  }

  const claimed = new Set<string>();
  const replacedIds: string[] = [];
  const addedIds: string[] = [];

  for (const incomingConversation of incoming.conversations) {
    const incomingExternalId = normalizeExternalId(
      incomingConversation.externalId
    );
    const stableId = incomingExternalId
      ? stableConversationId(incomingExternalId, new Set())
      : undefined;

    let matchIndex = -1;
    if (incomingExternalId != null) {
      const byExt = byExternalId.get(incomingExternalId);
      if (
        byExt != null &&
        !claimed.has(conversations[byExt].id)
      ) {
        matchIndex = byExt;
      }
    }
    if (matchIndex < 0) {
      const byIncomingId = byId.get(incomingConversation.id);
      if (
        byIncomingId != null &&
        !claimed.has(conversations[byIncomingId].id)
      ) {
        matchIndex = byIncomingId;
      }
    }
    if (matchIndex < 0 && stableId != null) {
      const byStable = byId.get(stableId);
      if (byStable != null && !claimed.has(conversations[byStable].id)) {
        matchIndex = byStable;
      }
    }

    const keepId =
      matchIndex >= 0
        ? conversations[matchIndex].id
        : incomingConversation.id;
    const incomingMessages = remappedMessages(
      incomingMessagesByConversation.get(incomingConversation.id) ?? [],
      keepId
    );

    if (matchIndex >= 0) {
      const prior = conversations[matchIndex];
      claimed.add(keepId);
      replacedIds.push(keepId);
      conversations[matchIndex] = {
        ...prior,
        externalId: incomingConversation.externalId ?? prior.externalId,
        channel: incomingConversation.channel,
        customerName: incomingConversation.customerName,
        startedAt: incomingConversation.startedAt,
        groundTruth:
          incomingConversation.groundTruth ?? prior.groundTruth,
        sourceFile: incomingConversation.sourceFile ?? prior.sourceFile,
        messageIds: incomingMessages.map((message) => message.id),
      };
      messagesByConversation.set(keepId, incomingMessages);
      continue;
    }

    claimed.add(incomingConversation.id);
    addedIds.push(incomingConversation.id);
    const newIndex = conversations.length;
    conversations.push({
      ...incomingConversation,
      messageIds: incomingMessages.map((message) => message.id),
    });
    byId.set(incomingConversation.id, newIndex);
    if (incomingExternalId && !byExternalId.has(incomingExternalId)) {
      byExternalId.set(incomingExternalId, newIndex);
    }
    messagesByConversation.set(incomingConversation.id, incomingMessages);
  }

  const messages = conversations.flatMap(
    (conversation) => messagesByConversation.get(conversation.id) ?? []
  );

  return { conversations, messages, replacedIds, addedIds };
}

/**
 * Add every incoming conversation as its own row.
 * A second upload that shares a filename must not restamp the first file's chats
 * even when `externalId` values overlap. Colliding conversation ids get a new id.
 */
export function appendConversationsAsDistinctFile(
  existing: ConversationRecords,
  incoming: ConversationRecords,
): MergeConversationsResult {
  const conversations = existing.conversations.map((conversation) => ({
    ...conversation,
    messageIds: [...conversation.messageIds],
  }));
  const messages = existing.messages.map((message) => ({ ...message }));
  const used = new Set(conversations.map((conversation) => conversation.id));
  const addedIds: string[] = [];

  const incomingMessagesByConversation = new Map<string, Message[]>();
  for (const message of incoming.messages) {
    const list =
      incomingMessagesByConversation.get(message.conversationId) ?? [];
    list.push(message);
    incomingMessagesByConversation.set(message.conversationId, list);
  }

  for (const incomingConversation of incoming.conversations) {
    let id = incomingConversation.id;
    if (used.has(id)) {
      id = stableConversationId(incomingConversation.externalId, used);
    } else {
      used.add(id);
    }
    const incomingMessages = remappedMessages(
      incomingMessagesByConversation.get(incomingConversation.id) ?? [],
      id,
    );
    addedIds.push(id);
    conversations.push({
      ...incomingConversation,
      id,
      messageIds: incomingMessages.map((message) => message.id),
    });
    messages.push(...incomingMessages);
  }

  return { conversations, messages, replacedIds: [], addedIds };
}
