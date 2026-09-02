import { describe, expect, it, vi } from "vitest";
import type { Signal, StoreData, SupervisedAction } from "./types";
import {
  applySupervisedActionDecision,
  composeRetentionEmailDraft,
  createRetentionEmailAction,
  ensureSupervisedActions,
  findSupervisedAction,
  HIGH_RETENTION_CONFIDENCE,
  isQueueApproveSignal,
  resolveApproveDecision,
  shouldGenerateRetentionEmail,
} from "./supervised-actions";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_ret_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.86,
    confidence: 0.86,
    summary: "High churn risk",
    suggestedAction: "Call today",
    evidence: ['quote: "I am closing my account"'],
    status: "new",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function emptyStore(signals: Signal[] = []): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: signals.map((item) => ({
      id: item.conversationId,
      tenantId: "tenant_demo",
      channel: "email",
      customerName: "Priya Shah",
      startedAt: "2026-09-01T00:00:00.000Z",
      messageIds: [],
    })),
    messages: [],
    signals,
    supervisedActions: [],
    actionLogs: [],
  };
}

describe("shouldGenerateRetentionEmail", () => {
  it("is true only for high-confidence retention", () => {
    expect(shouldGenerateRetentionEmail(signal())).toBe(true);
    expect(
      shouldGenerateRetentionEmail(signal({ confidence: 0.74 })),
    ).toBe(false);
    expect(shouldGenerateRetentionEmail(signal({ type: "lead" }))).toBe(false);
    expect(shouldGenerateRetentionEmail(signal({ type: "upsell" }))).toBe(
      false,
    );
    expect(HIGH_RETENTION_CONFIDENCE).toBe(0.75);
  });
});

describe("isQueueApproveSignal", () => {
  it("matches high-confidence retention or a stored draft", () => {
    expect(isQueueApproveSignal(signal())).toBe(true);
    expect(isQueueApproveSignal(signal({ type: "lead" }))).toBe(false);
    const stored = createRetentionEmailAction({
      signal: signal({ id: "sig_stored", confidence: 0.4 }),
      customerName: "Priya",
    });
    expect(
      isQueueApproveSignal(signal({ id: "sig_stored", confidence: 0.4 }), [
        stored,
      ]),
    ).toBe(true);
  });
});

describe("composeRetentionEmailDraft", () => {
  it("builds a short finance-appropriate email from the evidence quote", () => {
    const draft = composeRetentionEmailDraft({
      customerName: "Priya Shah",
      evidence: ['quote: "I am closing my account"'],
    });
    expect(draft.subject).toBe("Checking in on your account");
    expect(draft.evidenceQuote).toBe("I am closing my account");
    expect(draft.body).toContain("Hi Priya Shah,");
    expect(draft.body).toContain("“I am closing my account”");
    expect(draft.body).toContain("Would a brief call this week be convenient?");
    expect(draft.body).toContain("Best regards");
    expect(draft.body.length).toBeLessThan(500);
  });

  it("falls back without a quote or name", () => {
    const draft = composeRetentionEmailDraft({
      evidence: ['phrase: "close my account"'],
    });
    expect(draft.body).toContain("Hi there,");
    expect(draft.body).toContain("recent conversation");
    expect(draft.evidenceQuote).toBe("");
  });
});

describe("ensureSupervisedActions", () => {
  it("creates one pending draft and logs generated", () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => {});
    const store = emptyStore([signal()]);
    const { created, changed } = ensureSupervisedActions(store);
    expect(changed).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].type).toBe("retention_email_draft");
    expect(created[0].status).toBe("pending");
    expect(created[0].body).toContain("Priya Shah");
    expect(store.actionLogs).toHaveLength(1);
    expect(store.actionLogs?.[0].event).toBe("generated");
    expect(info).toHaveBeenCalledWith(
      "[supervised-action]",
      "generated",
      expect.objectContaining({ actionId: created[0].id }),
    );
    info.mockRestore();
  });

  it("does not regenerate an existing draft", () => {
    const store = emptyStore([signal()]);
    ensureSupervisedActions(store);
    const first = store.supervisedActions?.[0];
    const { created, changed } = ensureSupervisedActions(store);
    expect(created).toHaveLength(0);
    expect(changed).toBe(false);
    expect(store.supervisedActions).toHaveLength(1);
    expect(store.supervisedActions?.[0]).toEqual(first);
    expect(store.actionLogs).toHaveLength(1);
  });

  it("skips lead and low-confidence retention", () => {
    const store = emptyStore([
      signal({ id: "sig_lead", type: "lead", conversationId: "conv_lead" }),
      signal({
        id: "sig_low",
        conversationId: "conv_low",
        confidence: 0.4,
      }),
    ]);
    expect(ensureSupervisedActions(store).created).toHaveLength(0);
    expect(store.supervisedActions).toHaveLength(0);
  });

  it("rematches a stored draft to a new signal id", () => {
    const store = emptyStore([signal()]);
    ensureSupervisedActions(store);
    const next = signal({ id: "sig_ret_2" });
    store.signals = [next];
    const { created, changed } = ensureSupervisedActions(store);
    expect(created).toHaveLength(0);
    expect(changed).toBe(true);
    expect(store.supervisedActions?.[0].signalId).toBe("sig_ret_2");
    expect(findSupervisedAction(store.supervisedActions, next)?.id).toBe(
      store.supervisedActions?.[0].id,
    );
  });

  it("backfills empty pending evidence quote when signal evidence arrives", () => {
    const store = emptyStore([signal({ evidence: [] })]);
    const { created } = ensureSupervisedActions(store);
    expect(created[0].evidenceQuote).toBe("");
    store.signals = [
      signal({
        evidence: ['quote: "Please close my account"'],
      }),
    ];
    const { created: again, changed } = ensureSupervisedActions(store);
    expect(again).toHaveLength(0);
    expect(changed).toBe(true);
    const draft = store.supervisedActions?.[0];
    expect(draft?.evidenceQuote).toBe("Please close my account");
    expect(draft?.body).toContain("Please close my account");
  });
});

describe("applySupervisedActionDecision", () => {
  it("records approved when the generated draft is unchanged", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    const result = applySupervisedActionDecision(store, action.id, "approved");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("approved");
    expect(result.action.decidedAt).toBeTruthy();
    expect(store.actionLogs?.map((event) => event.event)).toEqual([
      "generated",
      "approved",
    ]);
  });

  it("records edited when the body changed before approve", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    const result = applySupervisedActionDecision(store, action.id, "approved", {
      body: `${action.body}\n\nP.S. Happy to stay late today.`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("edited");
    expect(store.actionLogs?.at(-1)?.event).toBe("edited");
  });

  it("records dismissed without sending", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    const result = applySupervisedActionDecision(store, action.id, "dismissed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("dismissed");
    expect(store.actionLogs?.at(-1)?.event).toBe("dismissed");
  });

  it("rejects a second decision", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    applySupervisedActionDecision(store, action.id, "dismissed");
    expect(
      applySupervisedActionDecision(store, action.id, "approved"),
    ).toEqual({ ok: false, reason: "already_decided" });
  });
});

describe("resolveApproveDecision", () => {
  it("uses edited when the working copy differs", () => {
    const action: SupervisedAction = {
      ...createRetentionEmailAction({
        signal: signal(),
        customerName: "Priya",
        evidence: ['quote: "I am closing my account"'],
      }),
      body: "Hi Priya,\n\nRevised copy.",
    };
    expect(resolveApproveDecision(action)).toBe("edited");
  });
});
