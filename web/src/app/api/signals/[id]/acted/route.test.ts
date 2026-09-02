import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendClientError } from "@/lib/backend-client";
import { readStore, resetStore, setSignalFeedback, writeStore } from "@/lib/store";
import type { Signal } from "@/lib/types";
import { POST } from "./route";

const setPredictionActed = vi.fn();
const createPrediction = vi.fn();
const submitFeedback = vi.fn();

vi.mock("@/lib/backend-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend-client")>();
  return {
    ...actual,
    setPredictionActed: (...args: unknown[]) => setPredictionActed(...args),
    createPrediction: (...args: unknown[]) => createPrediction(...args),
    submitFeedback: (...args: unknown[]) => submitFeedback(...args),
  };
});

function actedRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/signals/x/acted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function neonRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "pred-orphan-1",
    tenant_id: "tenant_demo",
    conversation_id: "conv_gone",
    signal_type: "retention",
    confidence: 0.9,
    summary: "x",
    acted: true,
    created_at: "2026-08-01T00:00:00.000Z",
    feedback: {
      id: "fb-1",
      tenant_id: "tenant_demo",
      signal_id: "pred-orphan-1",
      feedback: "correct",
      note: null,
      reviewed_by: "shadow_reviewer",
      reviewed_at: "2026-08-01T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("POST /api/signals/[id]/acted", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    setPredictionActed.mockReset();
    setPredictionActed.mockResolvedValue(neonRow());
    createPrediction.mockReset();
    createPrediction.mockRejectedValue(
      new Error("backend unavailable in tests")
    );
    submitFeedback.mockReset();
    await resetStore();
    // Hydrate/seed dual-write uses createPrediction; only count Acted recovery.
    createPrediction.mockClear();
    submitFeedback.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.clearAllMocks();
  });

  it("returns 404 when the signal is missing", async () => {
    const res = await POST(actedRequest({ acted: true }), {
      params: Promise.resolve({ id: "sig_missing" }),
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Signal not found" });
    expect(setPredictionActed).not.toHaveBeenCalled();
  });

  it("returns 400 when the signal has no feedback", async () => {
    const store = await readStore();
    const target = store.signals.find((s) => !s.feedback);
    expect(target).toBeTruthy();

    const res = await POST(actedRequest({ acted: true }), {
      params: Promise.resolve({ id: target!.id }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Signal must be reviewed before marking acted",
    });
    expect(setPredictionActed).not.toHaveBeenCalled();
  });

  it("returns 400 when acted is not a boolean", async () => {
    const res = await POST(actedRequest({ acted: "yes" }), {
      params: Promise.resolve({ id: "sig_any" }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "acted must be true or false",
    });
  });

  it("persists acted on a reviewed signal", async () => {
    const store = await readStore();
    const target = store.signals[0];
    await setSignalFeedback(target.id, "correct");

    const res = await POST(actedRequest({ acted: true }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signal: { status: string; feedback?: { label: string } };
    };
    expect(body.signal.status).toBe("acted");
    expect(body.signal.feedback?.label).toBe("correct");
    expect(setPredictionActed).not.toHaveBeenCalled();

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.status).toBe("acted");
  });

  it("dual-writes Acted to FastAPI when backendSignalId exists", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    const res = await POST(actedRequest({ acted: true }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);
    expect(setPredictionActed).toHaveBeenCalledWith(
      store.tenant.id,
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      true
    );
    const body = (await res.json()) as { signal: Signal };
    expect(body.signal.status).toBe("acted");
  });

  it("returns 503 and leaves JSON unacted when FastAPI dual-write fails", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    setPredictionActed.mockRejectedValueOnce(
      new BackendClientError("Signal Score backend unreachable", 503)
    );

    const res = await POST(actedRequest({ acted: true }), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({
      error: "Signal Score backend unreachable",
    });
    expect(
      (await readStore()).signals.find((s) => s.id === target.id)?.status
    ).not.toBe("acted");
  });

  it("saves via backendSignalId when JSON URL id is stale", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "pred-hosted-1";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "pred-hosted-1",
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: `${target.id}_llm_stale` }) }
    );
    expect(res.status).toBe(200);
    expect(setPredictionActed).toHaveBeenCalledWith(
      store.tenant.id,
      "pred-hosted-1",
      true
    );
    const body = (await res.json()) as { signal: Signal };
    expect(body.signal.id).toBe(target.id);
    expect(body.signal.status).toBe("acted");

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.status).toBe("acted");
  });

  it("saves via conversationId + type when URL id is stale", async () => {
    const store = await readStore();
    const target = store.signals[0];
    await setSignalFeedback(target.id, "correct");

    const res = await POST(
      actedRequest({
        acted: true,
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: `${target.id}_llm_stale` }) }
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signal: Signal };
    expect(body.signal.id).toBe(target.id);
    expect(body.signal.status).toBe("acted");

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.status).toBe("acted");
  });

  it("marks Neon-only when JSON row is gone but backendSignalId is sent", async () => {
    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "pred-orphan-1",
        conversationId: "conv_gone",
        type: "retention",
      }),
      { params: Promise.resolve({ id: "sig_conv_gone_retention_llm" }) }
    );
    expect(res.status).toBe(200);
    expect(setPredictionActed).toHaveBeenCalledWith(
      expect.any(String),
      "pred-orphan-1",
      true
    );
    const body = (await res.json()) as { signal: Signal; neonOnly?: boolean };
    expect(body.neonOnly).toBe(true);
    expect(body.signal.backendSignalId).toBe("pred-orphan-1");
    expect(body.signal.status).toBe("acted");
    expect(body.signal.feedback?.label).toBe("correct");
  });

  it("uses stub UUID when JSON is missing after neon-only feedback", async () => {
    const stubId = "sig_neon_aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    setPredictionActed.mockResolvedValue(
      neonRow({ id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee" })
    );

    const res = await POST(
      actedRequest({
        acted: true,
        conversationId: "conv_gone",
        type: "retention",
      }),
      { params: Promise.resolve({ id: stubId }) }
    );
    expect(res.status).toBe(200);
    expect(setPredictionActed).toHaveBeenCalledWith(
      expect.any(String),
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      true
    );
    const body = (await res.json()) as { signal: Signal; neonOnly?: boolean };
    expect(body.neonOnly).toBe(true);
    expect(body.signal.status).toBe("acted");
  });

  it("marks Neon Acted when JSON has the row but no local feedback", async () => {
    const store = await readStore();
    const target = store.signals.find((s) => !s.feedback);
    expect(target).toBeTruthy();
    target!.backendSignalId = "pred-neon-only-fb";
    await writeStore(store);

    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "pred-neon-only-fb",
        conversationId: target!.conversationId,
        type: target!.type,
      }),
      { params: Promise.resolve({ id: target!.id }) }
    );
    expect(res.status).toBe(200);
    expect(setPredictionActed).toHaveBeenCalledWith(
      store.tenant.id,
      "pred-neon-only-fb",
      true
    );
    const body = (await res.json()) as { signal: Signal; neonOnly?: boolean };
    expect(body.neonOnly).toBe(true);
    expect(body.signal.status).toBe("acted");

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target!.id)?.status).not.toBe(
      "acted"
    );
  });

  it("uses the live body backendSignalId when JSON UUID is stale", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "stale-uuid-gone";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    setPredictionActed.mockResolvedValue(neonRow({ id: "live-uuid" }));

    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "live-uuid",
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: target.id }) }
    );
    expect(res.status).toBe(200);
    expect(setPredictionActed).toHaveBeenCalledTimes(1);
    expect(setPredictionActed).toHaveBeenCalledWith(
      store.tenant.id,
      "live-uuid",
      true
    );
    expect(createPrediction).not.toHaveBeenCalled();
    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.backendSignalId).toBe(
      "live-uuid"
    );
    expect(after.signals.find((s) => s.id === target.id)?.status).toBe("acted");
  });

  it("recreates the prediction when stored Neon UUID is stale (404)", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "83a80e70-7a28-479e-a2c3-56e82ce010c3";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    setPredictionActed
      .mockRejectedValueOnce(
        new BackendClientError(
          "Signal 83a80e70-7a28-479e-a2c3-56e82ce010c3 not found for tenant",
          404
        )
      )
      .mockResolvedValueOnce(neonRow({ id: "pred-live-2" }));
    createPrediction.mockResolvedValue({ id: "pred-live-2" });

    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "83a80e70-7a28-479e-a2c3-56e82ce010c3",
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
    expect(submitFeedback).not.toHaveBeenCalled();
    expect(setPredictionActed).toHaveBeenLastCalledWith(
      store.tenant.id,
      "pred-live-2",
      true
    );
    const body = (await res.json()) as { signal: Signal };
    expect(body.signal.status).toBe("acted");
    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.backendSignalId).toBe(
      "pred-live-2"
    );
  });

  it("submits local Correct then Acted when upserted row has no feedback", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "stale-uuid-gone";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    setPredictionActed
      .mockRejectedValueOnce(
        new BackendClientError("Signal stale-uuid-gone not found for tenant", 404)
      )
      .mockRejectedValueOnce(
        new BackendClientError(
          "Signal must be reviewed before marking acted",
          400
        )
      )
      .mockResolvedValueOnce(neonRow({ id: "pred-live-3" }));
    createPrediction.mockResolvedValue({ id: "pred-live-3" });
    submitFeedback.mockResolvedValue({ ok: true });

    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "stale-uuid-gone",
        conversationId: target.conversationId,
        type: target.type,
      }),
      { params: Promise.resolve({ id: target.id }) }
    );
    expect(res.status).toBe(200);
    expect(submitFeedback).toHaveBeenCalledWith(
      store.tenant.id,
      "pred-live-3",
      expect.objectContaining({ feedback: "correct" })
    );
    expect(setPredictionActed).toHaveBeenLastCalledWith(
      store.tenant.id,
      "pred-live-3",
      true
    );
    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.status).toBe("acted");
  });

  it("does not leak tenant-not-found UUID when recovery is impossible", async () => {
    setPredictionActed.mockRejectedValueOnce(
      new BackendClientError(
        "Signal 83a80e70-7a28-479e-a2c3-56e82ce010c3 not found for tenant",
        404
      )
    );

    const res = await POST(
      actedRequest({
        acted: true,
        backendSignalId: "83a80e70-7a28-479e-a2c3-56e82ce010c3",
      }),
      { params: Promise.resolve({ id: "sig_missing" }) }
    );
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Could not save Mark Acted. Try again.",
    });
    expect(createPrediction).not.toHaveBeenCalled();
  });
});
