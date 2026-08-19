import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "@/lib/backend-client";
import { readStore, resetStore, setSignalFeedback, writeStore } from "@/lib/store";
import { POST } from "./route";

function actedRequest(acted: unknown) {
  return new Request("http://localhost/api/signals/x/acted", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ acted }),
  });
}

describe("POST /api/signals/[id]/acted", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("returns 404 when the signal is missing", async () => {
    const res = await POST(actedRequest(true), {
      params: Promise.resolve({ id: "sig_missing" }),
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({ error: "Signal not found" });
  });

  it("returns 400 when the signal has no feedback", async () => {
    const store = await readStore();
    const target = store.signals.find((s) => !s.feedback);
    expect(target).toBeTruthy();

    const res = await POST(actedRequest(true), {
      params: Promise.resolve({ id: target!.id }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "Signal must be reviewed before marking acted",
    });
  });

  it("returns 400 when acted is not a boolean", async () => {
    const res = await POST(actedRequest("yes"), {
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

    const res = await POST(actedRequest(true), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      signal: { status: string; feedback?: { label: string } };
    };
    expect(body.signal.status).toBe("acted");
    expect(body.signal.feedback?.label).toBe("correct");

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

    const actedSpy = vi.spyOn(backendClient, "setPredictionActed").mockResolvedValue({
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      tenant_id: "tenant_demo",
      conversation_id: target.conversationId,
      signal_type: target.type,
      confidence: target.confidence,
      summary: target.summary,
      created_at: target.createdAt,
      acted: true,
      feedback: null,
    });

    const res = await POST(actedRequest(true), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);
    expect(actedSpy).toHaveBeenCalledWith(
      "tenant_demo",
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      true
    );
  });

  it("still persists JSON Acted when FastAPI dual-write fails", async () => {
    const store = await readStore();
    const target = store.signals[0];
    expect(target).toBeTruthy();
    target.backendSignalId = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
    await writeStore(store);
    await setSignalFeedback(target.id, "correct");

    vi.spyOn(backendClient, "setPredictionActed").mockRejectedValue(
      new Error("Signal Score backend unreachable")
    );

    const res = await POST(actedRequest(true), {
      params: Promise.resolve({ id: target.id }),
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { signal: { status: string } };
    expect(body.signal.status).toBe("acted");
    expect(
      (await readStore()).signals.find((s) => s.id === target.id)?.status
    ).toBe("acted");
  });
});
