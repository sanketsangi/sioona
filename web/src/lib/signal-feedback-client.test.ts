import { afterEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "./types";
import {
  postSignalFeedback,
  SignalFeedbackError,
} from "./signal-feedback-client";

const signal: Signal = {
  id: "sig_1",
  tenantId: "tenant_demo",
  conversationId: "conv_1",
  type: "retention",
  score: 0.8,
  confidence: 0.8,
  summary: "Churn risk",
  suggestedAction: "Call back",
  evidence: [],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
  backendSignalId: "pred-1",
};

describe("postSignalFeedback", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts label and optional note with resolve fields", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postSignalFeedback(signal, "correct", "  ops wording  ");

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/signals/sig_1/feedback",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          label: "correct",
          note: "ops wording",
          backendSignalId: "pred-1",
          conversationId: "conv_1",
          type: "retention",
          confidence: 0.8,
          summary: "Churn risk",
        }),
      }),
    );
  });

  it("throws SignalFeedbackError on 503", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ error: "backend down" }),
      }),
    );

    await expect(postSignalFeedback(signal, "incorrect")).rejects.toMatchObject(
      {
        name: "SignalFeedbackError",
        message: "backend down",
        status: 503,
      } satisfies Partial<SignalFeedbackError>,
    );
  });
});
