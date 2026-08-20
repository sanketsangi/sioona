import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "@/lib/backend-client";
import * as demo from "@/lib/demo";
import { EXPECTED_TESTING_JSON } from "@/lib/testing-json-eval";
import type { PartnerDemoResult } from "@/lib/demo";
import type { StoreData } from "@/lib/types";
import { POST } from "./route";

function storeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const partnerDemoStore: StoreData = {
  tenant: {
    id: "tenant_demo",
    name: "Demo",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  conversations: [],
  messages: [],
  signals: [],
  pilot: {
    baselineOpportunities: 4,
    lastUploadedFileName: "Groww_batch_02",
  },
  taxonomyOverrides: {},
};

function partnerDemoResult(
  overrides?: Partial<PartnerDemoResult>
): PartnerDemoResult {
  return {
    store: partnerDemoStore,
    importedConversations: 12,
    newSignals: 3,
    samples: ["Groww_batch_02"],
    baselineOpportunities: 4,
    opportunityLift: 8,
    predictionSync: {
      attempted: 3,
      created: 3,
      updated: 0,
      failed: 0,
      skipped: 0,
    },
    conversationSync: {
      attempted: 12,
      created: 12,
      updated: 0,
      failed: 0,
      skipped: 0,
      messagesCreated: 12,
      messagesUpdated: 0,
    },
    detectLlm: {
      enabled: false,
      candidates: 0,
      attempted: 0,
      added: 0,
      failed: 0,
      skipped: 0,
    },
    wipe: {
      ok: true,
      conversations: 0,
      messages: 0,
      predictions: 0,
      feedback: 0,
      pilot_settings: 0,
    },
    ...overrides,
  };
}

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
    const body = (await res.json()) as {
      conversations: unknown[];
      wipeFailed?: boolean;
      wipeError?: string;
      taxonomyOverrides?: unknown;
    };

    expect(res.status).toBe(200);
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(body.conversations).toHaveLength(EXPECTED_TESTING_JSON.conversations);
    expect(body.taxonomyOverrides).toEqual({});
    expect(body.wipeFailed).toBe(true);
    expect(body.wipeError).toMatch(/unreachable/i);
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
    const body = (await res.json()) as {
      wipeFailed?: boolean;
      conversations: unknown[];
    };

    expect(res.status).toBe(200);
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(body.wipeFailed).toBeUndefined();
    expect(body.conversations).toHaveLength(EXPECTED_TESTING_JSON.conversations);
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
      storeRequest({
        action: "set_baseline",
        baselineOpportunities: -1,
      })
    );
    expect(invalid.status).toBe(400);
    await expect(invalid.json()).resolves.toEqual({
      error: "baselineOpportunities must be a non-negative number",
    });

    const infinite = await POST(
      storeRequest({
        action: "set_baseline",
        baselineOpportunities: Number.POSITIVE_INFINITY,
      })
    );
    expect(infinite.status).toBe(400);

    const asString = await POST(
      storeRequest({
        action: "set_baseline",
        baselineOpportunities: "12",
      })
    );
    expect(asString.status).toBe(400);
  });
});

describe("POST /api/store partner_demo", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("returns 500 with the thrown message when Partner Demo fails", async () => {
    vi.spyOn(demo, "runPartnerDemo").mockRejectedValue(
      new Error("testing.json missing")
    );

    const res = await POST(storeRequest({ action: "partner_demo" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "testing.json missing",
    });
  });

  it("maps non-Error throws to Partner demo failed", async () => {
    vi.spyOn(demo, "runPartnerDemo").mockRejectedValue("boom");

    const res = await POST(storeRequest({ action: "partner_demo" }));
    expect(res.status).toBe(500);
    await expect(res.json()).resolves.toEqual({
      error: "Partner demo failed",
    });
  });

  it("surfaces wipeFailed extras when Neon wipe did not complete", async () => {
    vi.spyOn(demo, "runPartnerDemo").mockResolvedValue(
      partnerDemoResult({
        wipe: {
          ok: false,
          error: "Signal Score backend unreachable",
          conversations: 0,
          messages: 0,
          predictions: 0,
          feedback: 0,
          pilot_settings: 0,
        },
      })
    );

    const res = await POST(storeRequest({ action: "partner_demo" }));
    const body = (await res.json()) as {
      wipeFailed?: boolean;
      wipeError?: string;
      importedConversations?: number;
      samples?: string[];
    };

    expect(res.status).toBe(200);
    expect(body.importedConversations).toBe(12);
    expect(body.samples).toEqual(["Groww_batch_02"]);
    expect(body.wipeFailed).toBe(true);
    expect(body.wipeError).toMatch(/unreachable/i);
  });

  it("omits wipeFailed when wipe succeeds", async () => {
    vi.spyOn(demo, "runPartnerDemo").mockResolvedValue(partnerDemoResult());

    const res = await POST(storeRequest({ action: "partner_demo" }));
    const body = (await res.json()) as { wipeFailed?: boolean };

    expect(res.status).toBe(200);
    expect(body.wipeFailed).toBeUndefined();
  });
});
