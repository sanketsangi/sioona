import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStore, resetStore, writeStore } from "@/lib/store";
import { ensureSupervisedActions } from "@/lib/supervised-actions";
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
    vi.unstubAllGlobals();
  });

  it("returns 404 when the signal is missing", async () => {
    const res = await POST(actionRequest("sig_missing", { decision: "approved" }), {
      params: Promise.resolve({ id: "sig_missing" }),
    });
    expect(res.status).toBe(404);
  });

  it("returns 404 when the signal is not high-confidence retention", async () => {
    const store = await readStore();
    const lead = store.signals.find((item) => item.type === "lead");
    expect(lead).toBeTruthy();
    const res = await POST(actionRequest(lead!.id, {}), {
      params: Promise.resolve({ id: lead!.id }),
    });
    expect(res.status).toBe(404);
    const data = (await res.json()) as { error?: string };
    expect(data.error).toMatch(/high-confidence retention/i);
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
        decision: "approved",
        body: "Hi there,\n\nRevised offer.\n\nBest regards",
        subject: "Checking in on your account",
      }),
      { params: Promise.resolve({ id: "sig_ret_edit" }) },
    );
    expect(res.status).toBe(200);
    const data = (await res.json()) as { action: { status: string } };
    expect(data.action.status).toBe("edited");
  });

  it("rejects a second decision", async () => {
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
    expect(second.status).toBe(409);
  });
});
