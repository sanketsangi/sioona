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
  incoming: Message[],
  incomingConversationId: string,
  keepId: string
): Message[] {
  return incoming
    .filter((message) => message.conversationId === incomingConversationId)
    .map((message, index) => ({
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

    const matchIndex = conversations.findIndex((existingConversation) => {
      if (claimed.has(existingConversation.id)) return false;
      const existingExternalId = normalizeExternalId(
        existingConversation.externalId
      );
      if (
        incomingExternalId &&
        existingExternalId &&
        incomingExternalId === existingExternalId
      ) {
        return true;
      }
      return (
        existingConversation.id === incomingConversation.id ||
        (stableId != null && existingConversation.id === stableId)
      );
    });

    const incomingMessages = remappedMessages(
      incoming.messages,
      incomingConversation.id,
      matchIndex >= 0
        ? conversations[matchIndex].id
        : incomingConversation.id
    );

    if (matchIndex >= 0) {
      const prior = conversations[matchIndex];
      const keepId = prior.id;
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
        messageIds: incomingMessages.map((message) => message.id),
      };
      messagesByConversation.set(keepId, incomingMessages);
      continue;
    }

    claimed.add(incomingConversation.id);
    addedIds.push(incomingConversation.id);
    conversations.push({
      ...incomingConversation,
      messageIds: incomingMessages.map((message) => message.id),
    });
    messagesByConversation.set(incomingConversation.id, incomingMessages);
  }

  const messages = conversations.flatMap(
    (conversation) => messagesByConversation.get(conversation.id) ?? []
  );

  return { conversations, messages, replacedIds, addedIds };
}
