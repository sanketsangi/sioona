import { afterEach, describe, expect, it, vi } from "vitest";
import type { Signal } from "./types";
import { postSignalActed, SignalActedError } from "./signal-acted-client";

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
  status: "reviewed",
  createdAt: "2026-08-01T00:00:00.000Z",
  backendSignalId: "pred-1",
};

describe("postSignalActed", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("posts acted with Neon UUID when present", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    await postSignalActed(signal, true);

    expect(fetchMock).toHaveBeenCalledWith(
      "/api/signals/sig_1/acted",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          acted: true,
          backendSignalId: "pred-1",
          conversationId: "conv_1",
          type: "retention",
        }),
      }),
    );
  });

  it("omits backendSignalId when the JSON card has no Neon UUID", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    vi.stubGlobal("fetch", fetchMock);

    const { backendSignalId: _omit, ...local } = signal;
    await postSignalActed(local, false);

    expect(JSON.parse(fetchMock.mock.calls[0][1].body as string)).toEqual({
      acted: false,
      conversationId: "conv_1",
      type: "retention",
    });
  });

  it("throws SignalActedError on API failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "must review first" }),
      }),
    );

    await expect(postSignalActed(signal, true)).rejects.toMatchObject({
      name: "SignalActedError",
      message: "must review first",
      status: 409,
    } satisfies Partial<SignalActedError>);
  });

  it("uses the fallback message when the error body is not JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => {
          throw new Error("not json");
        },
      }),
    );

    await expect(postSignalActed(signal, true)).rejects.toMatchObject({
      name: "SignalActedError",
      message: "Failed to update acted status",
      status: 500,
    });
  });
});
