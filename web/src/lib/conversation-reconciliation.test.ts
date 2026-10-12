import { describe, expect, it } from "vitest";
import { reconcileConversationData, compareConversationViews } from "./conversation-reconciliation";
import type { BackendConversationInput } from "./backend-client";
const chat: BackendConversationInput = { conversation_id: "c", channel: "chat", started_at: "2026-10-01T00:00:00Z", messages: [{ message_id: "m", role: "customer", content: "Hello", timestamp: "2026-10-01T00:00:00Z" }] };
describe("conversation reconciliation", () => {
  it("normalizes timestamps", () => { expect(reconcileConversationData([chat], [{ ...chat, started_at: "2026-10-01T00:00:00+00:00" }]).equal).toBe(true); });
  it("detects loss and equal-count text changes without exposing text", () => {
    expect(reconcileConversationData([chat], []).missingConversations).toEqual(["c"]);
    const report = reconcileConversationData([chat], [{ ...chat, messages: [{ ...chat.messages[0], content: "Different" }] }]);
    expect(report.equal).toBe(false); expect(report.changedMessages).toEqual(["m"]);
    expect(JSON.stringify(report)).not.toContain("Different");
  });
  it("rejects duplicate identities", () => {
    expect(() => reconcileConversationData([chat, chat], [])).toThrow("Duplicate");
    expect(() => reconcileConversationData([{ ...chat, messages: [chat.messages[0], chat.messages[0]] }], [])).toThrow("Duplicate");
  });
});
it("detects moved messages, label changes, and target-only rows", () => {
  const moved = { ...chat, conversation_id: "other" };
  const report = reconcileConversationData([{ ...chat, ground_truth: "lead" }], [moved]);
  expect(report.changedMessages).toEqual(["m"]);
  expect(report.extraConversations).toEqual(["other"]);
  expect(reconcileConversationData([chat], [{ ...chat, ground_truth: "none" }]).changedConversations).toEqual(["c"]);
});

import { emptyStoreForTenant } from "./store";
it("compares keep-set, filters, pages and outcomes independently of array order", () => {
  const source = emptyStoreForTenant("t");
  source.conversations = Array.from({ length: 51 }, (_, index) => ({ id: `c${index}`, tenantId: "t", channel: "chat", startedAt: "2026-10-01T00:00:00Z", messageIds: [] }));
  const target = structuredClone(source);
  target.conversations.reverse();
  expect(compareConversationViews(source, target).equal).toBe(true);
  target.conversations[0].groundTruth = "none";
  expect(compareConversationViews(source, target).mismatches).toContain("ground-truth:none");
  target.conversations.pop();
  expect(compareConversationViews(source, target).mismatches).toContain("keep-set");
  expect(compareConversationViews(source, target).mismatches.some(name => name.startsWith("page:"))).toBe(true);
});
it("detects feedback loss and changed reviewer notes without exposing notes", () => {
  const source = emptyStoreForTenant("t");
  source.signals = [{ id: "s", tenantId: "t", conversationId: "c", type: "lead", score: 90, confidence: 0.9, summary: "", suggestedAction: "", evidence: [], status: "reviewed", createdAt: "2026-10-01T00:00:00Z", feedback: { label: "correct", note: "private reviewer note", reviewedAt: "2026-10-01T00:00:00Z" } }];
  const target = structuredClone(source);
  delete target.signals[0].feedback;
  const report = compareConversationViews(source, target);
  expect(report.mismatches).toContain("feedback-and-outcomes");
  expect(report.sourceCounts.feedback).toBe(1);
  expect(report.targetCounts.feedback).toBe(0);
  expect(JSON.stringify(report)).not.toContain("private reviewer note");
  target.signals[0].feedback = { ...source.signals[0].feedback!, note: "changed" };
  expect(compareConversationViews(source, target).equal).toBe(false);
});
