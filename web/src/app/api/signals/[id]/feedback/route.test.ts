import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStore, resetStore, writeStore } from "@/lib/store";
import type { Signal } from "@/lib/types";
import { POST } from "./route";

const submitFeedback = vi.fn();
const createPrediction = vi.fn();

vi.mock("@/lib/backend-client", () => ({
  BackendClientError: class BackendClientError extends Error {
    status: number;
    constructor(message: string, status: number) {
      super(message);
      this.status = status;
    }
  },
  submitFeedback: (...args: unknown[]) => submitFeedback(...args),
  createPrediction: (...args: unknown[]) => createPrediction(...args),
}));

function feedbackRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/signals/x/feedback", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/signals/[id]/feedback", () => {
  beforeEach(async () => {
    submitFeedback.mockReset();
    createPrediction.mockReset();
    submitFeedback.mockResolvedValue({ ok: true });
    await resetStore();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it.each(["{not json", "null", '"text"'])(
    "returns 400 for an unusable body %s",
    async (raw) => {
      const res = await POST(
        new Request("http://localhost/api/signals/x/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: raw,
        }),
        { params: Promise.resolve({ id: "sig_any" }) }
      );
      expect(res.status).toBe(400);
      expect(submitFeedback).not.toHaveBeenCalled();
    }
  );

  it("returns 404 when signal cannot be resolved and no Neon id", async () => {
    const res = await POST(
      feedbackRequest({ label: "correct" }),
      { params: Promise.resolve({ id: "sig_missing" }) }
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Signal not found" });
    expect(submitFeedback).not.toHaveBeenCalled();
  });

  it("saves via backendSignalId when JSON URL id is stale", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "pred-hosted-1";
    await writeStore(store);

    const res = await POST(
      feedbackRequest({
        label: "correct",
        backendSignalId: "pred-hosted-1",
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: `${target.id}_llm_stale` }) }
    );
    expect(res.status).toBe(200);
    expect(submitFeedback).toHaveBeenCalledWith(
      store.tenant.id,
      "pred-hosted-1",
      expect.objectContaining({ feedback: "correct" })
    );
    const body = (await res.json()) as { signal: Signal };
    expect(body.signal.id).toBe(target.id);
    expect(body.signal.feedback?.label).toBe("correct");

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.feedback?.label).toBe(
      "correct"
    );
  });

  it("submits Neon-only when JSON row is gone but backendSignalId is sent", async () => {
    const res = await POST(
      feedbackRequest({
        label: "incorrect",
        backendSignalId: "pred-orphan-1",
        conversationId: "conv_gone",
        type: "retention",
      }),
      { params: Promise.resolve({ id: "sig_conv_gone_retention_llm" }) }
    );
    expect(res.status).toBe(200);
    expect(submitFeedback).toHaveBeenCalledWith(
      expect.any(String),
      "pred-orphan-1",
      expect.objectContaining({ feedback: "incorrect" })
    );
    const body = (await res.json()) as { signal: Signal; neonOnly?: boolean };
    expect(body.neonOnly).toBe(true);
    expect(body.signal.backendSignalId).toBe("pred-orphan-1");
    expect(body.signal.feedback?.label).toBe("incorrect");
  });

  it("recreates prediction when stored Neon UUID is stale (404)", async () => {
    const { BackendClientError } = await import("@/lib/backend-client");
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "stale-uuid-gone";
    await writeStore(store);

    submitFeedback
      .mockRejectedValueOnce(
        new BackendClientError(
          "Signal stale-uuid-gone not found for tenant",
          404
        )
      )
      .mockResolvedValueOnce({ ok: true });
    createPrediction.mockResolvedValue({ id: "pred-live-2" });

    const res = await POST(
      feedbackRequest({
        label: "correct",
        backendSignalId: "stale-uuid-gone",
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: target.id }) }
    );
    expect(res.status).toBe(200);
    expect(createPrediction).toHaveBeenCalledWith(
      store.tenant.id,
      expect.objectContaining({
        conversation_id: target.conversationId,
        signal_type: target.type,
      })
    );
    expect(submitFeedback).toHaveBeenLastCalledWith(
      store.tenant.id,
      "pred-live-2",
      expect.objectContaining({ feedback: "correct" })
    );
    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.backendSignalId).toBe(
      "pred-live-2"
    );
  });

  it("does not invent a prediction when Postgres mode sees a stale id", async () => {
    const storeLib = await import("@/lib/store");
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "stale-uuid-gone";
    vi.spyOn(storeLib, "readStore").mockResolvedValue(store);
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    const { BackendClientError } = await import("@/lib/backend-client");
    submitFeedback.mockRejectedValue(
      new BackendClientError("Signal stale-uuid-gone not found for tenant", 404),
    );

    const res = await POST(
      feedbackRequest({
        label: "correct",
        backendSignalId: "stale-uuid-gone",
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: target.id }) },
    );

    expect(res.status).toBe(409);
    expect(createPrediction).not.toHaveBeenCalled();
    expect(target.feedback).toBeUndefined();
    vi.unstubAllEnvs();
  });
});
