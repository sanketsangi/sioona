import { beforeEach, describe, expect, it } from "vitest";
import {
  appendAuditEvent,
  normalizeStore,
  readStore,
  resetStore,
  setSignalFeedback,
} from "./store";
import type { StoreData } from "./types";

describe("appendAuditEvent", () => {
  it("appends a typed, id/timestamped entry", () => {
    const store = normalizeStore({
      tenant: { id: "t", name: "T", createdAt: "2026-01-01T00:00:00.000Z" },
      conversations: [],
      messages: [],
      signals: [],
    } as StoreData);

    const entry = appendAuditEvent(store, {
      action: "signal_feedback",
      signalId: "sig_x",
      conversationId: "conv_x",
      signalType: "lead",
      label: "accept",
    });

    expect(entry.id).toMatch(/^audit_/);
    expect(entry.timestamp).toMatch(/\d{4}-\d{2}-\d{2}T/);
    expect(store.auditEvents).toHaveLength(1);
    expect(store.auditEvents?.[0]).toEqual(entry);
  });
});

describe("setSignalFeedback audit trail", () => {
  beforeEach(async () => {
    await resetStore();
  });

  it("records an audit event when SignalScore feedback is saved", async () => {
    const before = await readStore();
    expect(before.auditEvents).toEqual([]);
    const target = before.signals[0];
    expect(target).toBeTruthy();

    await setSignalFeedback(target.id, "accept", "clear buying intent");

    const after = await readStore();
    expect(after.auditEvents?.length).toBe(1);
    const event = after.auditEvents![0];
    expect(event.action).toBe("signal_feedback");
    expect(event.signalId).toBe(target.id);
    expect(event.conversationId).toBe(target.conversationId);
    expect(event.signalType).toBe(target.type);
    expect(event.label).toBe("accept");
  });
});
