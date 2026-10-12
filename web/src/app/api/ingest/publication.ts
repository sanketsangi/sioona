export function signalsForPublishedConversations<
  T extends { conversationId: string },
>(signals: T[], conversations: { id: string }[]): T[] {
  const publishedIds = new Set(conversations.map((conversation) => conversation.id));
  return signals.filter((signal) => publishedIds.has(signal.conversationId));
}
