import { describe, expect, it } from "vitest";

import {
  queueActionKindForSignal,
  resolveRetentionEmailAction,
} from "./queue-action-kind";
import { HIGH_RETENTION_CONFIDENCE } from "./supervised-actions";
import type { Signal, SupervisedAction } from "./types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "Churn risk",
    suggestedAction: "Call",
    evidence: ['quote: "I am closing my account"'],
    status: "new",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function stored(overrides: Partial<SupervisedAction> = {}): SupervisedAction {
  return {
    id: "act_sig_1",
    signalId: "sig_1",
    conversationId: "conv_1",
    tenantId: "tenant_demo",
    type: "retention_email_draft",
    status: "pending",
    subject: "Following up",
    body: "Hello",
    evidenceQuote: "I am closing my account",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  } as SupervisedAction;
}

describe("resolveRetentionEmailAction", () => {
  it("composes a pending draft when nothing is stored", () => {
    const action = resolveRetentionEmailAction(signal(), "Priya Shah");
    expect(action?.type).toBe("retention_email_draft");
    expect(action?.status).toBe("pending");
  });

  it("returns the stored draft when its type matches", () => {
    const draft = stored({ status: "approved" });
    expect(resolveRetentionEmailAction(signal(), "Priya", draft)).toBe(draft);
  });

  it("ignores a stored draft of a different kind", () => {
    const wrongKind = stored({ type: "retention_followup_draft" });
    const action = resolveRetentionEmailAction(signal(), "Priya", wrongKind);
    expect(action).not.toBe(wrongKind);
    expect(action?.type).toBe("retention_email_draft");
  });

  it("fills an empty stored quote from live evidence without changing status", () => {
    const empty = stored({ evidenceQuote: "  ", status: "approved" });
    const action = resolveRetentionEmailAction(signal(), "Priya", empty);
    expect(action?.status).toBe("approved");
    expect(action?.id).toBe(empty.id);
    expect(action?.evidenceQuote.trim()).not.toBe("");
  });

  it("keeps an approved draft when source evidence is stale", () => {
    const approved = stored({ status: "approved", body: "Kept body" });
    const action = resolveRetentionEmailAction(
      signal({ evidenceStatus: "stale", evidence: ['quote: "old source"'] }),
      "Priya",
      approved,
    );
    expect(action).toBe(approved);
    expect(action?.status).toBe("approved");
    expect(action?.body).toBe("Kept body");
  });

  it("does not fill an empty quote from a stale signal", () => {
    const empty = stored({ evidenceQuote: "", status: "approved", body: "Kept body" });
    const action = resolveRetentionEmailAction(
      signal({ evidenceStatus: "stale", evidence: ['quote: "old source"'] }),
      "Priya",
      empty,
    );
    expect(action).toBe(empty);
    expect(action?.status).toBe("approved");
    expect(action?.body).toBe("Kept body");
  });

  it("leaves an empty quote alone when the signal has no evidence", () => {
    const empty = stored({ evidenceQuote: "" });
    expect(
      resolveRetentionEmailAction(signal({ evidence: [] }), "Priya", empty),
    ).toBe(empty);
  });
});

describe("queueActionKindForSignal", () => {
  it("is 'acted' for acted signals, even with a decided draft", () => {
    expect(
      queueActionKindForSignal(
        signal({ status: "acted" }),
        "Priya",
        stored({ status: "approved" }),
      ),
    ).toBe("acted");
  });

  it("is 'mark_acted' for Correct feedback that is not yet acted", () => {
    expect(
      queueActionKindForSignal(
        signal({
          status: "reviewed",
          feedback: { label: "correct", reviewedAt: "2026-09-02T00:00:00Z" },
        }),
        "Priya",
      ),
    ).toBe("mark_acted");
  });

  it.each(["approved", "edited", "dismissed"] as const)(
    "echoes a stored %s decision",
    (status) => {
      expect(
        queueActionKindForSignal(signal(), "Priya", stored({ status })),
      ).toBe(status);
    },
  );

  it("is 'approve' for a pending high-confidence retention email", () => {
    expect(queueActionKindForSignal(signal(), "Priya")).toBe("approve");
  });

  it("is 'review' just below the retention email threshold", () => {
    expect(
      queueActionKindForSignal(
        signal({ confidence: HIGH_RETENTION_CONFIDENCE - 0.01 }),
        "Priya",
      ),
    ).toBe("review");
  });

  it.each(["lead", "upsell"] as const)("is 'review' for a %s signal", (type) => {
    expect(queueActionKindForSignal(signal({ type }), "Priya")).toBe("review");
  });
});
