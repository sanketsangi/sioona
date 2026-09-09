/** Group messages by conversation without allocating empty arrays on first insert. */
export function groupMessagesByConversation<
  T extends { conversationId: string },
>(messages: readonly T[]): Map<string, T[]> {
  const byConversation = new Map<string, T[]>();
  for (const message of messages) {
    const list = byConversation.get(message.conversationId);
    if (list) {
      list.push(message);
    } else {
      byConversation.set(message.conversationId, [message]);
    }
  }
  return byConversation;
}
