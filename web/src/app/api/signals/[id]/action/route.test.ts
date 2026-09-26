import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStore, resetStore, writeStore } from "@/lib/store";
import { ensureSupervisedActions } from "@/lib/supervised-actions";
import * as supervised from "@/lib/supervised-actions";
import { POST } from "./route";

function actionRequest(
  id: string,
  body: Record<string, unknown>,
) {
  return new Request(`http://localhost/api/signals/${id}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/signals/[id]/action", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests")),
    );
    await resetStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("returns 404 when the signal is missing", async () => {
    const res = await POST(actionRequest("sig_missing", { decision: "approved" }), {
      params: Promise.resolve({ id: "sig_missing" }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("Signal not found");
  });

  it("returns an honest 404 when the signal has no draft", async () => {
    const store = await readStore();
    const lead = store.signals.find((item) => item.type === "lead");
    expect(lead).toBeTruthy();
    vi.spyOn(supervised, "shouldGenerateSupervisedDraft").mockReturnValue(false);
    vi.spyOn(supervised, "findSupervisedAction").mockReturnValue(undefined);
    const res = await POST(actionRequest(lead!.id, {}), {
      params: Promise.resolve({ id: lead!.id }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe("No supervised draft for this signal.");
  });

  it("generates a lead outreach draft and records a decision without sending", async () => {
    const store = await readStore();
    const lead = store.signals.find((item) => item.type === "lead");
    expect(lead).toBeTruthy();
    const res = await POST(actionRequest(lead!.id, { decision: "approved" }), {
      params: Promise.resolve({ id: lead!.id }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      action: { type: string; status: string };
      sent: boolean;
    };
    expect(data.action.type).toBe("lead_outreach_draft");
    expect(data.action.status).toBe("approved");
    expect(data.sent).toBe(false);
  });

  it("generates a follow-up draft for lower-confidence retention", async () => {
    const store = await readStore();
    store.signals.push({
      id: "sig_ret_low",
      tenantId: store.tenant.id,
      conversationId: "conv_ret_low_only",
      type: "retention",
      score: 0.42,
      confidence: 0.42,
      summary: "Fee complaint",
      suggestedAction: "Call",
      evidence: ['quote: "These fees are too high"'],
      status: "new",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    await writeStore(store);
    const res = await POST(actionRequest("sig_ret_low", {}), {
      params: Promise.resolve({ id: "sig_ret_low" }),
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      action: { type: string; subject: string; body: string; status: string };
    };
    expect(data.action.type).toBe("retention_followup_draft");
    expect(data.action.status).toBe("pending");
    expect(data.action.subject).toBe(
      "Offer loyalty credit / brokerage rebate pending policy approval",
    );
    expect(data.action.body).toContain("I saw your note about");
    expect(data.action.body).not.toContain("Best regards");
  });

  it("generates an upsell note draft", async () => {
    const store = await readStore();
    let upsell = store.signals.find((item) => item.type === "upsell");
    if (!upsell) {
      upsell = {
        id: "sig_up_test",
        tenantId: store.tenant.id,
        conversationId: "conv_up_only",
        type: "upsell",
        score: 0.66,
        confidence: 0.66,
        summary: "Insurance alongside equity",
        suggestedAction: "Share eligibility",
        evidence: ['quote: "Can you add insurance"'],
        status: "new",
        createdAt: "2026-09-01T00:00:00.000Z",
      };
      store.signals.push(upsell);
      await writeStore(store);
    }
    const res = await POST(
      actionRequest(upsell.id, { decision: "dismissed" }),
      { params: Promise.resolve({ id: upsell.id }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      action: { type: string; status: string };
      sent: boolean;
    };
    expect(data.action.type).toBe("upsell_note_draft");
    expect(data.action.status).toBe("dismissed");
    expect(data.sent).toBe(false);
  });

  it("does not promote a stored follow-up into a retention email", async () => {
    const store = await readStore();
    const conversationId = store.conversations[0]?.id ?? "conv_x";
    const stubId = "sig_neon_follow_only";
    store.supervisedActions = [
      {
        id: "act_follow_only",
        type: "retention_followup_draft",
        signalId: stubId,
        conversationId,
        tenantId: store.tenant.id,
        subject:
          "Escalate to senior support with ledger + prior tickets attached",
        body: "Hi there — I saw your note about “pause my SIP”.",
        generatedSubject:
          "Escalate to senior support with ledger + prior tickets attached",
        generatedBody: "Hi there — I saw your note about “pause my SIP”.",
        evidenceQuote: "pause my SIP",
        status: "pending",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    await writeStore(store);

    const res = await POST(
      actionRequest(stubId, {
        decision: "approved",
        conversationId,
        type: "retention",
      }),
      { params: Promise.resolve({ id: stubId }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      action: { type: string; status: string };
      sent: boolean;
    };
    expect(data.sent).toBe(false);
    expect(data.action.status).toBe("approved");
    expect(data.action.type).toBe("retention_followup_draft");

    const after = await readStore();
    expect(
      after.supervisedActions?.some(
        (action) =>
          action.signalId === stubId && action.type === "retention_email_draft",
      ),
    ).toBe(false);
  });

  it("generates a draft then records approved without sending", async () => {
    const store = await readStore();
    const target = store.signals.find(
      (item) => item.type === "retention" && item.confidence >= 0.75,
    );
    if (!target) {
      store.signals.push({
        id: "sig_ret_test",
        tenantId: store.tenant.id,
        conversationId: store.conversations[0]?.id ?? "conv_x",
        type: "retention",
        score: 0.9,
        confidence: 0.9,
        summary: "Close account",
        suggestedAction: "Call",
        evidence: ['quote: "Please close my account"'],
        status: "new",
        createdAt: "2026-09-01T00:00:00.000Z",
      });
      await writeStore(store);
    }
    const afterSeed = await readStore();
    const retention = afterSeed.signals.find(
      (item) => item.type === "retention" && item.confidence >= 0.75,
    );
    expect(retention).toBeTruthy();

    const generated = await POST(actionRequest(retention!.id, {}), {
      params: Promise.resolve({ id: retention!.id }),
    });
    expect(generated.status).toBe(200);
    const generatedBody = (await generated.json()) as {
      action: { status: string; body: string };
    };
    expect(generatedBody.action.status).toBe("pending");
    expect(generatedBody.action.body).toContain("Best regards");

    const approved = await POST(
      actionRequest(retention!.id, { decision: "approved" }),
      { params: Promise.resolve({ id: retention!.id }) },
    );
    expect(approved.status).toBe(200);
    const approvedBody = (await approved.json()) as {
      action: { status: string };
      sent: boolean;
    };
    expect(approvedBody.action.status).toBe("approved");
    expect(approvedBody.sent).toBe(false);

    const persisted = await readStore();
    expect(
      persisted.actionLogs?.some((event) => event.event === "generated"),
    ).toBe(true);
    expect(
      persisted.actionLogs?.some((event) => event.event === "approved"),
    ).toBe(true);
  });

  it("records edited when the body changes", async () => {
    const store = await readStore();
    store.signals.push({
      id: "sig_ret_edit",
      tenantId: store.tenant.id,
      conversationId: store.conversations[0]?.id ?? "conv_x",
      type: "retention",
      score: 0.91,
      confidence: 0.91,
      summary: "Switching broker",
      suggestedAction: "Call",
      evidence: ['quote: "I am moving to another broker"'],
      status: "new",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    await writeStore(store);
    ensureSupervisedActions(await readStore());

    const res = await POST(
      actionRequest("sig_ret_edit", {
        decision: "edited",
        body: "Hi there,\n\nRevised offer.\n\nBest regards",
        subject: "Following up on your account — can we help?",
      }),
      { params: Promise.resolve({ id: "sig_ret_edit" }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { action: { status: string } };
    expect(data.action.status).toBe("edited");
  });

  it("allows a second decision after dismiss", async () => {
    const store = await readStore();
    store.signals.push({
      id: "sig_ret_twice",
      tenantId: store.tenant.id,
      conversationId: store.conversations[0]?.id ?? "conv_x",
      type: "retention",
      score: 0.88,
      confidence: 0.88,
      summary: "Pause",
      suggestedAction: "Call",
      evidence: ['quote: "Please pause my SIP"'],
      status: "new",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    await writeStore(store);

    await POST(actionRequest("sig_ret_twice", { decision: "dismissed" }), {
      params: Promise.resolve({ id: "sig_ret_twice" }),
    });
    const second = await POST(
      actionRequest("sig_ret_twice", { decision: "approved" }),
      { params: Promise.resolve({ id: "sig_ret_twice" }) },
    );
    expect(second.status).toBe(200);
    const data = (await second.json()) as { action: { status: string } };
    expect(data.action.status).toBe("approved");
  });

  it("approves a Neon-only stub when JSON has no matching signal", async () => {
    const neonId = "6a007658-d752-4112-ad7e-697c03bf9c79";
    const stubId = `sig_neon_${neonId}`;
    const conversationId = "conv_neon_only_retention";

    const generated = await POST(
      actionRequest(stubId, {
        backendSignalId: neonId,
        conversationId,
        type: "retention",
        confidence: 0.91,
        summary: "Close account",
        evidence: ['quote: "Please close my account"'],
      }),
      { params: Promise.resolve({ id: stubId }) },
    );
    expect(generated.status).toBe(200);

    const res = await POST(
      actionRequest(stubId, {
        decision: "approved",
        backendSignalId: neonId,
        conversationId,
        type: "retention",
        confidence: 0.91,
      }),
      { params: Promise.resolve({ id: stubId }) },
    );

    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      action: { status: string; signalId: string; conversationId: string };
      sent: boolean;
    };
    expect(data.sent).toBe(false);
    expect(data.action.status).toBe("approved");
    expect(data.action.signalId).toBe(stubId);
    expect(data.action.conversationId).toBe(conversationId);

    const store = await readStore();
    expect(store.signals.some((signal) => signal.id === stubId)).toBe(false);
    expect(
      store.supervisedActions?.some(
        (action) =>
          action.signalId === stubId && action.status === "approved",
      ),
    ).toBe(true);
  });

  it("decides via stored draft when only conversationId is sent", async () => {
    const store = await readStore();
    const conversationId = store.conversations[0]?.id ?? "conv_x";
    const stubId = "sig_neon_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    store.supervisedActions = [
      {
        id: "act_neon_stored",
        type: "retention_email_draft",
        signalId: stubId,
        conversationId,
        tenantId: store.tenant.id,
        subject: "Following up on your account — can we help?",
        body: "Hi there,\n\nStored.\n\nBest regards",
        generatedSubject: "Following up on your account — can we help?",
        generatedBody: "Hi there,\n\nStored.\n\nBest regards",
        evidenceQuote: "pause my SIP",
        status: "pending",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    ];
    await writeStore(store);

    const res = await POST(
      actionRequest(stubId, {
        decision: "dismissed",
        conversationId,
      }),
      { params: Promise.resolve({ id: stubId }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { action: { status: string } };
    expect(data.action.status).toBe("dismissed");
  });

  it("approves the email when both retention drafts share a signal", async () => {
    const store = await readStore();
    const conversationId = store.conversations[0]?.id ?? "conv_x";
    const signalId = "sig_band";
    store.signals.push({
      id: signalId,
      tenantId: store.tenant.id,
      conversationId,
      type: "retention",
      score: 0.6,
      confidence: 0.6,
      summary: "Fees",
      suggestedAction: "Call",
      evidence: ['quote: "These fees are too high"'],
      status: "new",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    store.supervisedActions = [
      {
        id: "act_follow_band",
        type: "retention_followup_draft",
        signalId,
        conversationId,
        tenantId: store.tenant.id,
        subject: "Follow up",
        body: "Follow",
        generatedSubject: "Follow up",
        generatedBody: "Follow",
        evidenceQuote: "fees",
        status: "approved",
        createdAt: "2026-09-01T00:00:00.000Z",
        decidedAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "act_email_band",
        type: "retention_email_draft",
        signalId,
        conversationId,
        tenantId: store.tenant.id,
        subject: "Email",
        body: "Email body",
        generatedSubject: "Email",
        generatedBody: "Email body",
        evidenceQuote: "fees",
        status: "pending",
        createdAt: "2026-09-02T00:00:00.000Z",
      },
    ];
    await writeStore(store);

    const res = await POST(
      actionRequest(signalId, {
        decision: "approved",
        type: "retention",
        confidence: 0.9,
      }),
      { params: Promise.resolve({ id: signalId }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as {
      action: { type: string; status: string };
      sent: boolean;
    };
    expect(data.sent).toBe(false);
    expect(data.action.type).toBe("retention_email_draft");
    expect(data.action.status).toBe("approved");

    const after = await readStore();
    expect(
      after.supervisedActions?.find(
        (action) => action.type === "retention_followup_draft",
      )?.status,
    ).toBe("approved");
    expect(
      after.supervisedActions?.find(
        (action) => action.type === "retention_email_draft",
      )?.status,
    ).toBe("approved");
  });

  it("does not approve the older follow-up when confidence is omitted", async () => {
    const store = await readStore();
    const conversationId = store.conversations[0]?.id ?? "conv_x";
    const stubId = "sig_neon_band_both";
    store.supervisedActions = [
      {
        id: "act_follow_omit",
        type: "retention_followup_draft",
        signalId: stubId,
        conversationId,
        tenantId: store.tenant.id,
        subject: "Follow up",
        body: "Follow",
        generatedSubject: "Follow up",
        generatedBody: "Follow",
        evidenceQuote: "fees",
        status: "pending",
        createdAt: "2026-09-01T00:00:00.000Z",
      },
      {
        id: "act_email_omit",
        type: "retention_email_draft",
        signalId: stubId,
        conversationId,
        tenantId: store.tenant.id,
        subject: "Email",
        body: "Email body",
        generatedSubject: "Email",
        generatedBody: "Email body",
        evidenceQuote: "fees",
        status: "pending",
        createdAt: "2026-09-02T00:00:00.000Z",
      },
    ];
    await writeStore(store);

    const res = await POST(
      actionRequest(stubId, {
        decision: "approved",
        conversationId,
        type: "retention",
      }),
      { params: Promise.resolve({ id: stubId }) },
    );
    expect(res.status).toBe(400);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toBe(
      "Confidence is required to choose the retention draft.",
    );

    const after = await readStore();
    expect(
      after.supervisedActions?.find(
        (action) => action.type === "retention_followup_draft",
      )?.status,
    ).toBe("pending");
    expect(
      after.supervisedActions?.find(
        (action) => action.type === "retention_email_draft",
      )?.status,
    ).toBe("pending");
  });
});
