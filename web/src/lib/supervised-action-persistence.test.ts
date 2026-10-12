import { beforeEach, describe, expect, it, vi } from "vitest";
import type { BackendSupervisedActionDecision } from "./backend-client";
import { queueActionKindForSignal } from "./queue-action-kind";
import { isRetentionDecisionKind } from "@/components/RetentionEmailAction";
import { findSupervisedAction } from "./supervised-actions";
import type { Signal, StoreData, SupervisedAction } from "./types";
import {
  applySupervisedDecisionOverlay,
  overlaySupervisedActionsFromNeon,
  syncSupervisedActionDecision,
} from "./supervised-action-persistence";

vi.mock("./backend-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./backend-client")>();
  return {
    ...actual,
    getSupervisedActionDecisions: vi.fn(),
    upsertSupervisedActionDecision: vi.fn(),
  };
});

import {
  getSupervisedActionDecisions,
  upsertSupervisedActionDecision,
} from "./backend-client";

function storeWithConversation(): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: [
      {
        id: "conv_keep",
        tenantId: "tenant_demo",
        channel: "whatsapp",
        startedAt: "2026-09-01T00:00:00.000Z",
        messageIds: [],
        customerName: "Priya",
      },
    ],
    messages: [],
    signals: [
      {
        id: "sig_local",
        tenantId: "tenant_demo",
        conversationId: "conv_keep",
        type: "retention",
        score: 0.91,
        confidence: 0.91,
        summary: "Wants to close",
        suggestedAction: "Call",
        evidence: ['quote: "I want to close"'],
        status: "new",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ],
  };
}

function neonRow(
  status: BackendSupervisedActionDecision["status"],
  subject = "Subject",
  body = "Body",
): BackendSupervisedActionDecision {
  return {
    id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd",
    tenant_id: "tenant_demo",
    conversation_id: "conv_keep",
    action_type: "retention_email_draft",
    status,
    subject,
    body,
    evidence_quote: "I want to close",
    created_at: "2026-09-28T00:00:00.000Z",
    decided_at: "2026-09-28T01:00:00.000Z",
  };
}

function neonStub(): Signal {
  return {
    id: "sig_neon_aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
    tenantId: "tenant_demo",
    conversationId: "conv_keep",
    type: "retention",
    score: 0.91,
    confidence: 0.91,
    summary: "Wants to close",
    suggestedAction: "",
    evidence: ['quote: "I want to close"'],
    status: "new",
    createdAt: "2026-09-28T00:00:00.000Z",
    backendSignalId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  };
}

describe("supervised action decision overlay", () => {
  beforeEach(() => {
    vi.mocked(getSupervisedActionDecisions).mockReset();
    vi.mocked(upsertSupervisedActionDecision).mockReset();
  });

  it("restores a decision onto a store that has the conversation but no drafts", () => {
    const store = storeWithConversation();
    expect(store.supervisedActions).toBeUndefined();
    applySupervisedDecisionOverlay(store, [
      neonRow("edited", "Edited subject", "Edited body"),
    ]);
    const stub = neonStub();
    const stored = findSupervisedAction(store.supervisedActions, stub);
    expect(stored?.signalId).not.toBe(stub.id);
    expect(stored?.status).toBe("edited");
    expect(stored?.subject).toBe("Edited subject");
    expect(stored?.body).toBe("Edited body");
    const kind = queueActionKindForSignal(stub, "Priya", stored);
    expect(kind).toBe("edited");
    expect(isRetentionDecisionKind(kind)).toBe(true);
  });

  it.each(["approved", "edited", "dismissed"] as const)(
    "sig_neon queue row resolves %s by conversation and action type",
    (status) => {
      const store = storeWithConversation();
      applySupervisedDecisionOverlay(store, [neonRow(status)]);
      const stub = neonStub();
      const stored = findSupervisedAction(store.supervisedActions, stub);
      const kind = queueActionKindForSignal(stub, "Priya", stored);
      expect(kind).toBe(status);
      expect(isRetentionDecisionKind(kind)).toBe(true);
    },
  );

  it("keeps the JSON decision when Neon overlay fails", async () => {
    const store = storeWithConversation();
    const local: SupervisedAction = {
      id: "act_local",
      type: "retention_email_draft",
      signalId: "sig_local",
      conversationId: "conv_keep",
      tenantId: "tenant_demo",
      subject: "Local subject",
      body: "Local body",
      generatedSubject: "Local subject",
      generatedBody: "Local body",
      evidenceQuote: "I want to close",
      status: "approved",
      createdAt: "2026-09-01T00:00:00.000Z",
      decidedAt: "2026-09-02T00:00:00.000Z",
    };
    store.supervisedActions = [local];
    vi.mocked(getSupervisedActionDecisions).mockRejectedValue(
      new Error("database_unavailable"),
    );
    await overlaySupervisedActionsFromNeon(store, ["conv_keep"]);
    expect(store.supervisedActions).toEqual([local]);
    expect(store.supervisedActions[0]?.status).toBe("approved");
  });

  it("keeps a newer JSON decision when Neon still has the previous one", async () => {
    const store = storeWithConversation();
    const local: SupervisedAction = {
      id: "act_local",
      type: "retention_email_draft",
      signalId: "sig_local",
      conversationId: "conv_keep",
      tenantId: "tenant_demo",
      subject: "Newer subject",
      body: "Newer body",
      generatedSubject: "Local subject",
      generatedBody: "Local body",
      evidenceQuote: "I want to close",
      status: "edited",
      createdAt: "2026-09-01T00:00:00.000Z",
      decidedAt: "2026-09-28T02:00:00.000Z",
    };
    store.supervisedActions = [local];
    vi.mocked(getSupervisedActionDecisions).mockResolvedValue([
      neonRow("approved", "Older subject", "Older body"),
    ]);
    await overlaySupervisedActionsFromNeon(store, ["conv_keep"]);
    expect(store.supervisedActions[0]?.status).toBe("edited");
    expect(store.supervisedActions[0]?.subject).toBe("Newer subject");
    expect(store.supervisedActions[0]?.body).toBe("Newer body");
  });

  it("does not drop a JSON decision when Neon returns no row", async () => {
    const store = storeWithConversation();
    const local: SupervisedAction = {
      id: "act_local",
      type: "retention_email_draft",
      signalId: "sig_local",
      conversationId: "conv_keep",
      tenantId: "tenant_demo",
      subject: "Local subject",
      body: "Local body",
      generatedSubject: "Local subject",
      generatedBody: "Local body",
      evidenceQuote: "I want to close",
      status: "dismissed",
      createdAt: "2026-09-01T00:00:00.000Z",
      decidedAt: "2026-09-02T00:00:00.000Z",
    };
    store.supervisedActions = [local];
    vi.mocked(getSupervisedActionDecisions).mockResolvedValue([]);
    await overlaySupervisedActionsFromNeon(store, ["conv_keep"]);
    expect(store.supervisedActions[0]?.status).toBe("dismissed");
    expect(store.supervisedActions[0]?.subject).toBe("Local subject");
  });

  it("fails a canonical decision request when its only durable write fails", async () => {
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    try {
      vi.mocked(upsertSupervisedActionDecision).mockRejectedValue(
        new Error("database_unavailable"),
      );
      const store = storeWithConversation();
      applySupervisedDecisionOverlay(store, [neonRow("approved")]);
      await expect(
        syncSupervisedActionDecision(store.supervisedActions![0]),
      ).rejects.toThrow("Canonical supervised decision write unavailable");
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
