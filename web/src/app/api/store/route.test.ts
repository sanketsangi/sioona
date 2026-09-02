import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "@/lib/backend-client";
import * as demo from "@/lib/demo";
import {
  partnerDemoStepSequence,
  readPartnerDemoNdjsonEvents,
} from "@/lib/partner-demo-progress";
import {
  EXPECTED_TESTING_JSON,
  EXPECTED_ZERODHA_BATCH02,
} from "@/lib/testing-json-eval";
import { POST } from "./route";

describe("POST /api/store reset", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("wipes Neon then reseeds testing.json and reports wipeFailed when down", async () => {
    const wipeSpy = vi
      .spyOn(backendClient, "wipeTenantData")
      .mockRejectedValue(new Error("Signal Score backend unreachable"));

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/ndjson/);

    const events = await readPartnerDemoNdjsonEvents(res);
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(partnerDemoStepSequence(events)).toEqual([
      "wipe",
      "detect",
      "sync_chats",
      "sync_signals",
    ]);
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type !== "complete") return;
    expect(complete.importedConversations).toBe(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(complete.wipeFailed).toBe(true);
    expect(complete.wipeError).toMatch(/unreachable/i);
    expect(events.some((event) => "conversations" in event)).toBe(false);
  });

  it("omits wipeFailed when Neon wipe succeeds", async () => {
    const wipeSpy = vi.spyOn(backendClient, "wipeTenantData").mockResolvedValue({
      conversations: 2,
      messages: 4,
      predictions: 1,
      feedback: 1,
      pilot_settings: 1,
    });

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reset" }),
      })
    );
    expect(res.status).toBe(200);

    const events = await readPartnerDemoNdjsonEvents(res);
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type !== "complete") return;
    expect(complete.wipeFailed).toBeUndefined();
    expect(complete.importedConversations).toBe(
      EXPECTED_TESTING_JSON.conversations
    );
  });

  it("rejects unknown actions and invalid baseline values", async () => {
    const unknown = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "wipe_all_tenants" }),
      })
    );
    expect(unknown.status).toBe(400);
    await expect(unknown.json()).resolves.toEqual({ error: "Unknown action" });

    const invalid = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_baseline",
          baselineOpportunities: -1,
        }),
      })
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "baselineOpportunities must be a non-negative number",
    });

    const infinite = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_baseline",
          baselineOpportunities: Number.POSITIVE_INFINITY,
        }),
      })
    );
    expect(infinite.status).toBe(400);

    const asString = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "set_baseline",
          baselineOpportunities: "12",
        }),
      })
    );
    expect(asString.status).toBe(400);
  });
});

describe("POST /api/store partner_demo", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("streams NDJSON wipe → detect → sync chats → sync signals → complete", async () => {
    vi.spyOn(backendClient, "wipeTenantData").mockRejectedValue(
      new Error("Signal Score backend unreachable")
    );

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      })
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/ndjson/);

    const events = await readPartnerDemoNdjsonEvents(res);
    expect(partnerDemoStepSequence(events)).toEqual([
      "wipe",
      "detect",
      "sync_chats",
      "sync_signals",
    ]);
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type !== "complete") return;
    expect(complete.importedConversations).toBe(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(complete.newSignals).toBeGreaterThan(0);
    expect(complete.wipeFailed).toBe(true);
    expect(events.some((event) => "conversations" in event)).toBe(false);
  });

  it("streams an error event when Partner Demo throws", async () => {
    vi.spyOn(demo, "runPartnerDemo").mockRejectedValue(
      new Error("testing.json missing")
    );

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      })
    );
    expect(res.status).toBe(200);
    const events = await readPartnerDemoNdjsonEvents(res);
    expect(events.at(-1)).toEqual({
      type: "error",
      error: "testing.json missing",
    });
  });

  it("maps non-Error throws to Partner demo failed", async () => {
    vi.spyOn(demo, "runPartnerDemo").mockRejectedValue("boom");

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      })
    );
    expect(res.status).toBe(200);
    const events = await readPartnerDemoNdjsonEvents(res);
    expect(events.at(-1)).toEqual({
      type: "error",
      error: "Partner demo failed",
    });
  });
});
