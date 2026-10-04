import { expect, it } from "vitest";
import { selectReportCorpus } from "./report-corpus";
import type { StoreData } from "./types";
const store = { conversations: [{ id: "a", sourceFile: "one.csv" }, { id: "b", sourceFile: "two.csv" }],
  signals: [{ conversationId: "a" }, { conversationId: "b" }], messages: [{ conversationId: "a" }, { conversationId: "b" }] } as unknown as StoreData;
it("selects matching chats and their messages and signals", () => {
  const scoped = selectReportCorpus(store, " one.csv ");
  expect(scoped.conversations.map((chat) => chat.id)).toEqual(["a"]);
  expect(scoped.messages.map((message) => message.conversationId)).toEqual(["a"]);
  expect(scoped.signals.map((signal) => signal.conversationId)).toEqual(["a"]);
  expect(store.conversations).toHaveLength(2);
});
it("keeps unknown file selections empty rather than broadening the corpus", () => {
  const scoped = selectReportCorpus(store, "missing.csv");
  expect(scoped.conversations).toEqual([]);
  expect(scoped.messages).toEqual([]);
  expect(scoped.signals).toEqual([]);
});
it("preserves unfiltered corpus", () => {
  expect(selectReportCorpus(store)).toBe(store);
});
