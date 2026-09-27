import { describe, expect, it, vi } from "vitest";
import type { Signal, StoreData, SupervisedAction } from "./types";
import {
  applySupervisedActionDecision,
  composePlaybookDraft,
  composeRetentionEmailDraft,
  createRetentionEmailAction,
  createSupervisedDraftAction,
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
  it("is true only for a pending high-confidence retention email", () => {
    expect(isQueueApproveSignal(signal())).toBe(true);
    expect(isQueueApproveSignal(signal({ confidence: 0.75 }))).toBe(true);
    expect(isQueueApproveSignal(signal({ confidence: 0.74 }))).toBe(false);
    expect(
      isQueueApproveSignal(signal({ type: "lead", confidence: 0.95 })),
    ).toBe(false);
    expect(
      isQueueApproveSignal(signal({ type: "upsell", confidence: 0.9 })),
    ).toBe(false);

    const high = signal();
    const pending = createRetentionEmailAction({
      signal: high,
      customerName: "Priya Shah",
    });
    expect(isQueueApproveSignal(high, [pending])).toBe(true);
    expect(
      isQueueApproveSignal(high, [{ ...pending, status: "approved" }]),
    ).toBe(false);

    const lead = signal({ type: "lead", confidence: 0.95, score: 0.95 });
    const leadDraft = createSupervisedDraftAction({
      signal: lead,
      customerName: "Priya Shah",
      evidence: lead.evidence,
    });
    expect(leadDraft?.type).toBe("lead_outreach_draft");
    expect(isQueueApproveSignal(lead, leadDraft ? [leadDraft] : [])).toBe(
      false,
    );
  });
});

describe("composePlaybookDraft", () => {
  it("uses the taxonomy line as subject and the customer reply as body", () => {
    const draft = composePlaybookDraft({
      type: "lead",
      score: 0.8,
      customerName: "Rahul",
      evidence: ['quote: "What are your pricing plans"'],
    });
    expect(draft.subject).toBe(
      "Route to sales / RM within 24h — send the product's pricing + onboarding or upgrade link",
    );
    expect(draft.body).toContain("Hi Rahul, thanks for asking about");
    expect(draft.body).toContain("“What are your pricing plans”");
    expect(draft.evidenceQuote).toBe("What are your pricing plans");
  });

  it("uses the playbook line as the body when there is no quote", () => {
    const draft = composePlaybookDraft({
      type: "upsell",
      score: 0.4,
      evidence: ['phrase: "insurance"'],
    });
    expect(draft.subject).toBe(
      "Tag CRM opportunity and notify sales with conversation link",
    );
    expect(draft.body).toBe(draft.subject);
    expect(draft.evidenceQuote).toBe("");
  });

  it("does not reuse the retention email for a lower-confidence follow-up", () => {
    const email = composeRetentionEmailDraft({
      customerName: "Priya",
      evidence: ['quote: "I am closing my account"'],
    });
    const follow = composePlaybookDraft({
      type: "retention",
      score: 0.6,
      customerName: "Priya",
      evidence: ['quote: "I am closing my account"'],
    });
    expect(email.subject).toBe("Following up on your account — can we help?");
    expect(email.body).toContain("Best regards");
    expect(follow.subject).toBe(
      "Escalate to senior support with ledger + prior tickets attached",
    );
    expect(follow.body).toContain("I saw your note about");
    expect(follow.body).not.toContain("Best regards");
  });
});

describe("composeRetentionEmailDraft", () => {
  it("builds a short finance-appropriate email from the evidence quote", () => {
    const draft = composeRetentionEmailDraft({
      customerName: "Priya Shah",
      evidence: ['quote: "I am closing my account"'],
    });
    expect(draft.subject).toBe("Following up on your account — can we help?");
    expect(draft.evidenceQuote).toBe("I am closing my account");
    expect(draft.body).toContain("Hi Priya Shah,");
    expect(draft.body).toContain("“I am closing my account”");
    expect(draft.body).toContain("same-day callback");
    expect(draft.body).toContain("Would a brief call today or tomorrow work?");
    expect(draft.body).toContain("Best regards");
    expect(draft.body.length).toBeLessThan(600);
  });

  it("falls back without a quote or name", () => {
    const draft = composeRetentionEmailDraft({
      evidence: ['phrase: "close my account"'],
    });
    expect(draft.subject).toBe("Following up on your account");
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

  it("creates one draft per conversation and signal type", () => {
    const store = emptyStore([
      signal({
        id: "sig_lead",
        type: "lead",
        conversationId: "conv_shared",
        score: 0.8,
        confidence: 0.8,
      }),
      signal({
        id: "sig_up",
        type: "upsell",
        conversationId: "conv_shared",
        score: 0.55,
        confidence: 0.55,
      }),
      signal({
        id: "sig_low",
        type: "retention",
        conversationId: "conv_low",
        score: 0.4,
        confidence: 0.4,
      }),
    ]);
    const { created } = ensureSupervisedActions(store);
    expect(created.map((action) => action.type).sort()).toEqual(
      [
        "lead_outreach_draft",
        "retention_followup_draft",
        "upsell_note_draft",
      ].sort(),
    );
    expect(created.find((action) => action.type === "lead_outreach_draft")?.id).toBe(
      "act_sig_lead__lead_outreach_draft",
    );
    const again = ensureSupervisedActions(store);
    expect(again.created).toHaveLength(0);
    expect(store.supervisedActions).toHaveLength(3);
  });

  it("does not regenerate a decided or edited playbook draft", () => {
    const store = emptyStore([
      signal({
        id: "sig_lead",
        type: "lead",
        conversationId: "conv_lead",
        score: 0.8,
        confidence: 0.8,
      }),
    ]);
    const [action] = ensureSupervisedActions(store).created;
    applySupervisedActionDecision(store, action.id, "edited", {
      body: "Custom outreach.",
    });
    const snapshot = store.supervisedActions?.[0];
    const { created, changed } = ensureSupervisedActions(store);
    expect(created).toHaveLength(0);
    expect(changed).toBe(false);
    expect(store.supervisedActions?.[0]).toEqual(snapshot);
    expect(store.supervisedActions?.[0].body).toBe("Custom outreach.");
  });

  it("shows the email after a band change without dropping the follow-up", () => {
    const low = signal({ confidence: 0.6, score: 0.6 });
    const store = emptyStore([low]);
    ensureSupervisedActions(store);
    expect(store.supervisedActions?.[0].type).toBe("retention_followup_draft");
    store.supervisedActions![0].status = "approved";
    const high = signal({ confidence: 0.9, score: 0.9 });
    store.signals = [high];
    ensureSupervisedActions(store);
    expect(store.supervisedActions?.map((action) => action.type).sort()).toEqual(
      ["retention_email_draft", "retention_followup_draft"].sort(),
    );
    expect(findSupervisedAction(store.supervisedActions, high)?.type).toBe(
      "retention_email_draft",
    );
    const follow = store.supervisedActions?.find(
      (action) => action.type === "retention_followup_draft",
    );
    expect(follow?.status).toBe("approved");
    expect(findSupervisedAction(store.supervisedActions, low)?.id).toBe(
      follow?.id,
    );
  });

  it("backfills an empty pending playbook quote and leaves an edited body", () => {
    const lead = signal({
      id: "sig_lead",
      type: "lead",
      conversationId: "conv_lead",
      score: 0.8,
      confidence: 0.8,
      evidence: [],
    });
    const store = emptyStore([lead]);
    ensureSupervisedActions(store);
    const draft = store.supervisedActions?.[0];
    expect(draft?.type).toBe("lead_outreach_draft");
    expect(draft?.evidenceQuote).toBe("");
    expect(draft?.body).toBe(draft?.subject);
    draft!.body = "Edited outreach.";
    store.signals = [
      {
        ...lead,
        evidence: ['quote: "What is the pricing for a demat account"'],
      },
    ];
    const { created, changed } = ensureSupervisedActions(store);
    expect(created).toHaveLength(0);
    expect(changed).toBe(true);
    expect(store.supervisedActions?.[0].evidenceQuote).toBe(
      "What is the pricing for a demat account",
    );
    expect(store.supervisedActions?.[0].body).toBe("Edited outreach.");
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

  it("records edited when Save Edit changes the body", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    const result = applySupervisedActionDecision(store, action.id, "edited", {
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

  it("allows Approve after an edited draft save", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    applySupervisedActionDecision(store, action.id, "edited", {
      body: `${action.body}\n\nRevised.`,
    });
    const result = applySupervisedActionDecision(store, action.id, "approved");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("approved");
  });

  it("allows a second Save Edit on an edited draft", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    applySupervisedActionDecision(store, action.id, "edited", {
      body: `${action.body}\n\nFirst revision.`,
    });
    const result = applySupervisedActionDecision(store, action.id, "edited", {
      body: `${action.body}\n\nSecond revision.`,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("edited");
    expect(result.action.body).toContain("Second revision.");
  });

  it("allows revising after approve or dismiss", () => {
    const store = emptyStore([signal()]);
    const [action] = ensureSupervisedActions(store).created;
    applySupervisedActionDecision(store, action.id, "dismissed");
    const result = applySupervisedActionDecision(store, action.id, "approved");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("approved");
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
