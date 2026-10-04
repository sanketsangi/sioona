import type { StoreData } from "./types";

/** One exact source-file selection for report display, PDF and evaluation. */
export function selectReportCorpus(store: StoreData, file?: string | null): StoreData {
  const source = file?.trim();
  if (!source) return store;
  const conversations = store.conversations.filter((chat) => chat.sourceFile === source);
  const ids = new Set(conversations.map((chat) => chat.id));
  return { ...store, conversations,
    messages: store.messages.filter((message) => ids.has(message.conversationId)),
    signals: store.signals.filter((signal) => ids.has(signal.conversationId)) };
}
