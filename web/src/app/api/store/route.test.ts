import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return { ...actual, after: vi.fn() };
});

vi.mock("@/lib/defer-ingest-sync", () => ({
  persistDeferredIngestDualWrite: vi.fn().mockResolvedValue(undefined),
}));

import { after } from "next/server";
import { persistDeferredIngestDualWrite } from "@/lib/defer-ingest-sync";
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
    vi.mocked(persistDeferredIngestDualWrite).mockClear();
    vi.mocked(after).mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("wipes Neon then reseeds testing.json; Neon wipe runs in after()", async () => {
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
    // Hot path does not wipe — after() does.
    expect(wipeSpy).not.toHaveBeenCalled();
    expect(partnerDemoStepSequence(events)).toEqual(["wipe", "detect"]);
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type !== "complete") return;
    expect(complete.importedConversations).toBe(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(complete.wipeFailed).toBeUndefined();
    expect(events.some((event) => "conversations" in event)).toBe(false);
    expect(after).toHaveBeenCalled();
    expect(persistDeferredIngestDualWrite).not.toHaveBeenCalled();
    const afterCb = vi.mocked(after).mock.calls[0]?.[0];
    expect(typeof afterCb).toBe("function");
    const putPilotSpy = vi.spyOn(backendClient, "putPilotSettings");
    await afterCb?.();
    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(putPilotSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        baseline_opportunities: 0,
        last_uploaded_file_name: "Groww_batch_02",
      })
    );
    expect(persistDeferredIngestDualWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: "tenant_demo",
        replaceShowcase: true,
        lastUploadedFileName: "Groww_batch_02",
      })
    );
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
    expect(wipeSpy).not.toHaveBeenCalled();
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
    vi.mocked(persistDeferredIngestDualWrite).mockClear();
    vi.mocked(after).mockClear();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("rejects Partner Demo reset outside json-demo mode", async () => {
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      }),
    );
    expect(res.status).toBe(409);
    expect(after).not.toHaveBeenCalled();
    expect(persistDeferredIngestDualWrite).not.toHaveBeenCalled();
  });

  it("streams NDJSON wipe → detect → complete (dual-write deferred)", async () => {
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
    expect(partnerDemoStepSequence(events)).toEqual(["wipe", "detect"]);
    const complete = events.at(-1);
    expect(complete?.type).toBe("complete");
    if (complete?.type !== "complete") return;
    expect(complete.importedConversations).toBe(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(complete.newSignals).toBeGreaterThan(0);
    expect(complete.wipeFailed).toBeUndefined();
    expect(events.some((event) => "conversations" in event)).toBe(false);
    expect(after).toHaveBeenCalled();
  });

  it("restores partner baseline to Neon after deferred wipe", async () => {
    vi.spyOn(backendClient, "wipeTenantData").mockResolvedValue({
      conversations: 1,
      messages: 1,
      predictions: 1,
      feedback: 1,
      pilot_settings: 1,
    });
    vi.spyOn(backendClient, "getPilotSettings")
      .mockResolvedValueOnce({
        id: "pilot-1",
        tenant_id: "tenant_demo",
        baseline_opportunities: 12,
        baseline_note: "partner agreed",
        weekly_export_count: 4,
        last_uploaded_file_name: "Groww_batch_02",
        created_at: "2026-08-18T00:00:00.000Z",
        updated_at: "2026-08-18T00:00:00.000Z",
      })
      .mockResolvedValue(null);
    const putPilotSpy = vi.spyOn(backendClient, "putPilotSettings");

    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "partner_demo" }),
      })
    );
    expect(res.status).toBe(200);
    await readPartnerDemoNdjsonEvents(res);

    const afterCb = vi.mocked(after).mock.calls[0]?.[0];
    expect(typeof afterCb).toBe("function");
    putPilotSpy.mockClear();
    await afterCb?.();

    expect(backendClient.wipeTenantData).toHaveBeenCalledWith("tenant_demo");
    expect(putPilotSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        baseline_opportunities: 12,
        baseline_note: "partner agreed",
      })
    );
    expect(persistDeferredIngestDualWrite).toHaveBeenCalled();
  });

  it("warms Sample and Partner Demo packs without writing the live store", async () => {
    const res = await POST(
      new Request("http://localhost/api/store", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "warmup_showcase" }),
      })
    );
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({
      ok: true,
      sample: true,
      partner: true,
    });
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
    expect(after).not.toHaveBeenCalled();
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
