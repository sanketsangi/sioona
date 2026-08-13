import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStore, resetStore, setSignalFeedback } from "@/lib/store";
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
});
