import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readStore, resetStore } from "@/lib/store";
import { POST } from "./route";

function groundTruthRequest(groundTruth: unknown) {
  return new Request("http://localhost/api/conversations/x/ground-truth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ groundTruth }),
  });
}

describe("POST /api/conversations/[id]/ground-truth", () => {
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

  it("returns 400 for labels outside lead | retention | upsell | none", async () => {
    const store = await readStore();
    const id = store.conversations[0]!.id;

    const res = await POST(groundTruthRequest("churn"), {
      params: Promise.resolve({ id }),
    });
    expect(res.status).toBe(400);
    await expect(res.json()).resolves.toEqual({
      error: "groundTruth must be lead | retention | upsell | none | null",
    });
  });

  it("returns 404 when the conversation is missing", async () => {
    const res = await POST(groundTruthRequest("lead"), {
      params: Promise.resolve({ id: "conv_missing" }),
    });
    expect(res.status).toBe(404);
    await expect(res.json()).resolves.toEqual({
      error: "Conversation not found",
    });
  });

  it("sets and clears groundTruth on the JSON conversation", async () => {
    const store = await readStore();
    const id = store.conversations[0]!.id;

    const setRes = await POST(groundTruthRequest("retention"), {
      params: Promise.resolve({ id }),
    });
    expect(setRes.status).toBe(200);
    await expect(setRes.json()).resolves.toEqual({
      conversationId: id,
      groundTruth: "retention",
    });
    expect(
      (await readStore()).conversations.find((c) => c.id === id)?.groundTruth
    ).toBe("retention");

    const clearRes = await POST(groundTruthRequest(null), {
      params: Promise.resolve({ id }),
    });
    expect(clearRes.status).toBe(200);
    await expect(clearRes.json()).resolves.toEqual({
      conversationId: id,
      groundTruth: null,
    });
    expect(
      (await readStore()).conversations.find((c) => c.id === id)?.groundTruth
    ).toBeUndefined();
  });
});
