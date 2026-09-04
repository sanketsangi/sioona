import { afterEach, describe, expect, it, vi } from "vitest";
import {
  postSupervisedAction,
  SupervisedActionError,
} from "./supervised-action-client";
import type { Signal } from "./types";

function retentionSignal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_neon_6a007658-d752-4112-ad7e-697c03bf9c79",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.91,
    confidence: 0.91,
    summary: "Close account",
    suggestedAction: "Call",
    evidence: ['quote: "Please close my account"'],
    status: "new",
    createdAt: "2026-09-01T00:00:00.000Z",
    backendSignalId: "6a007658-d752-4112-ad7e-697c03bf9c79",
    ...overrides,
  };
}

describe("postSupervisedAction", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts confidence, summary, and evidence for Neon stub recovery", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        action: {
          id: "act_1",
          status: "approved",
          subject: "Following up on your account — can we help?",
          body: "Hi",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const signal = retentionSignal();
    await postSupervisedAction(signal, {
      decision: "approved",
      subject: "Following up on your account — can we help?",
      draftBody: "Hi there",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `/api/signals/${signal.id}/action`,
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          decision: "approved",
          subject: "Following up on your account — can we help?",
          body: "Hi there",
          backendSignalId: signal.backendSignalId,
          conversationId: signal.conversationId,
          type: "retention",
          confidence: 0.91,
          summary: "Close account",
          evidence: ['quote: "Please close my account"'],
        }),
      }),
    );
  });

  it("surfaces Signal not found from the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: "Signal not found" }),
      }),
    );

    await expect(
      postSupervisedAction(retentionSignal(), { decision: "approved" }),
    ).rejects.toMatchObject({
      name: "SupervisedActionError",
      message: "Signal not found",
      status: 404,
    } satisfies Partial<SupervisedActionError>);
  });
});
