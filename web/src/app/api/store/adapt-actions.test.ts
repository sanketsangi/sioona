import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PARTNER_EXPORT_ADAPT_OVERRIDES } from "@/data/fixtures/partner-export-overrides";
import { ZERODHA_BATCH01_ADAPT_OVERRIDES } from "@/data/fixtures/zerodha-batch01-overrides";
import * as detectLlm from "@/lib/detect-llm";
import { readStore, resetStore, writeStore } from "@/lib/store";
import * as syncPredictions from "@/lib/sync-predictions";
import type { Signal } from "@/lib/types";
import { POST } from "./route";

const emptyLlm = {
  enabled: false,
  candidates: 0,
  attempted: 0,
  added: 0,
  failed: 0,
  skipped: 0,
};

const stubSignal: Signal = {
  id: "sig_adapt_stub",
  tenantId: "tenant_demo",
  conversationId: "conv_adapt_stub",
  type: "lead",
  score: 0.9,
  confidence: 0.9,
  summary: "stub",
  suggestedAction: "",
  evidence: [],
  status: "new",
  createdAt: "2026-08-01T00:00:00.000Z",
};

function storeRequest(body: Record<string, unknown>) {
  return new Request("http://localhost/api/store", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/store Adapt actions", () => {
  beforeEach(async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
    vi.spyOn(syncPredictions, "syncPredictionsToBackend").mockImplementation(
      async (signals) => ({
        signals,
        sync: {
          attempted: 0,
          created: 0,
          updated: 0,
          failed: 0,
          skipped: 0,
        },
      })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("merges Zerodha batch_01 overrides without dropping existing terms, then redetects", async () => {
    const detectSpy = vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [stubSignal],
      llm: emptyLlm,
    });

    const before = await readStore();
    before.taxonomyOverrides = {
      lead: { phrases: ["keep existing phrase"] },
    };
    await writeStore(before);

    const res = await POST(storeRequest({ action: "apply_zerodha_batch01_adapt" }));
    const body = (await res.json()) as {
      redetectCount?: number;
      taxonomyOverrides?: {
        lead?: { phrases?: string[] };
      };
    };

    expect(res.status).toBe(200);
    expect(body.redetectCount).toBe(1);
    expect(body.taxonomyOverrides?.lead?.phrases).toEqual(
      expect.arrayContaining([
        "keep existing phrase",
        ...(ZERODHA_BATCH01_ADAPT_OVERRIDES.lead?.phrases ?? []),
      ])
    );
    expect(detectSpy).toHaveBeenCalledWith(
      expect.any(Array),
      expect.any(Array),
      "tenant_demo",
      expect.objectContaining({
        lead: expect.objectContaining({
          phrases: expect.arrayContaining(["keep existing phrase", "open zerodha"]),
        }),
      }),
      { resumeIds: undefined }
    );

    const after = await readStore();
    expect(after.taxonomyOverrides?.lead?.phrases).toEqual(
      expect.arrayContaining(["keep existing phrase", "open zerodha"])
    );
  });

  it("merges partner-export Adapt negatives and phrases", async () => {
    vi.spyOn(detectLlm, "runHybridDetection").mockResolvedValue({
      signals: [stubSignal],
      llm: emptyLlm,
    });

    const res = await POST(
      storeRequest({ action: "apply_partner_export_adapt" })
    );
    const body = (await res.json()) as {
      taxonomyOverrides?: {
        lead?: { negativePhrases?: string[] };
        upsell?: { phrases?: string[] };
      };
    };

    expect(res.status).toBe(200);
    expect(body.taxonomyOverrides?.lead?.negativePhrases).toEqual(
      expect.arrayContaining(
        PARTNER_EXPORT_ADAPT_OVERRIDES.lead?.negativePhrases ?? []
      )
    );
    expect(body.taxonomyOverrides?.upsell?.phrases).toEqual(
      expect.arrayContaining(PARTNER_EXPORT_ADAPT_OVERRIDES.upsell?.phrases ?? [])
    );
  });

  it("returns 400 when Zerodha Adapt redetect throws", async () => {
    vi.spyOn(detectLlm, "runHybridDetection").mockRejectedValue(
      new Error("hybrid failed")
    );

    const res = await POST(storeRequest({ action: "apply_zerodha_batch01_adapt" }));
    const body = (await res.json()) as { error?: string };

    expect(res.status).toBe(400);
    expect(body.error).toBe("hybrid failed");
  });
});

describe("POST /api/store add_taxonomy_override", () => {
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

  it("rejects invalid type, field, and blank value", async () => {
    const badType = await POST(
      storeRequest({
        action: "add_taxonomy_override",
        type: "churn",
        field: "phrases",
        value: "close account",
        redetect: false,
      })
    );
    expect(badType.status).toBe(400);
    expect(await badType.json()).toEqual({
      error: "type must be lead | retention | upsell",
    });

    const badField = await POST(
      storeRequest({
        action: "add_taxonomy_override",
        type: "lead",
        field: "examples",
        value: "close account",
        redetect: false,
      })
    );
    expect(badField.status).toBe(400);
    expect(await badField.json()).toEqual({
      error: "field must be phrases | keywords | negativePhrases",
    });

    const blank = await POST(
      storeRequest({
        action: "add_taxonomy_override",
        type: "lead",
        field: "phrases",
        value: "   ",
        redetect: false,
      })
    );
    expect(blank.status).toBe(400);
    expect(await blank.json()).toEqual({ error: "value is required" });
  });

  it("persists a trimmed phrase when redetect is skipped", async () => {
    const res = await POST(
      storeRequest({
        action: "add_taxonomy_override",
        type: "retention",
        field: "phrases",
        value: "  thinking of leaving  ",
        redetect: false,
      })
    );
    const body = (await res.json()) as {
      redetectCount?: number;
      taxonomyOverrides?: { retention?: { phrases?: string[] } };
    };

    expect(res.status).toBe(200);
    expect(body.redetectCount).toBeUndefined();
    expect(body.taxonomyOverrides?.retention?.phrases).toEqual(
      expect.arrayContaining(["thinking of leaving"])
    );

    const after = await readStore();
    expect(after.taxonomyOverrides?.retention?.phrases).toEqual(
      expect.arrayContaining(["thinking of leaving"])
    );
  });
});
