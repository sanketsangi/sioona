import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { EXPECTED_TESTING_JSON } from "./testing-json-eval";
import {
  addTaxonomyOverride,
  decideSupervisedAction,
  emptyStoreForTenant,
  mergeTaxonomyOverrides,
  persistSupervisedActions,
  readStore,
  resetStore,
  resetStoreWithWipe,
  setConversationGroundTruth,
  setSignalActed,
  setSignalFeedback,
  TenantIsolationError,
  writeStore,
} from "./store";
import { runWithTenant, DEMO_TENANT_ID } from "./tenant-context";

describe("setSignalActed", () => {
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

  it("rejects missing signals", async () => {
    const result = await setSignalActed("sig_missing", true);
    expect(result).toEqual({ ok: false, reason: "not_found" });
  });

  it("rejects unreviewed signals", async () => {
    const store = await readStore();
    const target = store.signals.find((s) => !s.feedback);
    expect(target).toBeTruthy();

    const result = await setSignalActed(target!.id, true);
    expect(result).toEqual({ ok: false, reason: "not_reviewed" });

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target!.id)?.status).not.toBe(
      "acted"
    );
  });

  it("marks reviewed signals acted without clearing feedback", async () => {
    const before = await readStore();
    const target = before.signals[0];
    expect(target).toBeTruthy();

    await setSignalFeedback(target.id, "correct", "clear buying intent");
    const result = await setSignalActed(target.id, true);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.signal.status).toBe("acted");
    expect(result.signal.feedback?.label).toBe("correct");
    expect(result.signal.feedback?.note).toBe("clear buying intent");

    const after = await readStore();
    const persisted = after.signals.find((s) => s.id === target.id);
    expect(persisted?.status).toBe("acted");
    expect(persisted?.feedback?.label).toBe("correct");
  });

  it("rejects acted unless feedback is correct", async () => {
    const before = await readStore();
    const target = before.signals[0];
    await setSignalFeedback(target.id, "incorrect", "not churn");
    const incorrect = await setSignalActed(target.id, true);
    expect(incorrect).toEqual({ ok: false, reason: "not_reviewed" });

    await setSignalFeedback(target.id, "partially_correct", "close");
    const partial = await setSignalActed(target.id, true);
    expect(partial).toEqual({ ok: false, reason: "not_reviewed" });

    const after = await readStore();
    expect(after.signals.find((s) => s.id === target.id)?.status).not.toBe(
      "acted"
    );
  });

  it("undoes acted back to reviewed and keeps feedback", async () => {
    const before = await readStore();
    const target = before.signals[0];
    await setSignalFeedback(target.id, "correct", "not churn");
    await setSignalActed(target.id, true);
    await setSignalFeedback(target.id, "incorrect", "not churn");

    const undone = await setSignalActed(target.id, false);
    expect(undone.ok).toBe(true);
    if (!undone.ok) return;
    expect(undone.signal.status).toBe("reviewed");
    expect(undone.signal.feedback?.label).toBe("incorrect");
    expect(undone.signal.feedback?.note).toBe("not churn");
  });

  it("does not clear acted when feedback is saved again", async () => {
    const before = await readStore();
    const target = before.signals[0];
    await setSignalFeedback(target.id, "correct");
    await setSignalActed(target.id, true);
    await setSignalFeedback(target.id, "partially_correct", "ok type");

    const after = await readStore();
    const persisted = after.signals.find((s) => s.id === target.id);
    expect(persisted?.status).toBe("acted");
    expect(persisted?.feedback?.label).toBe("partially_correct");
    expect(persisted?.feedback?.note).toBe("ok type");
  });
});

describe("setConversationGroundTruth", () => {
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

  it("persists JSON labels when Neon is down", async () => {
    const before = await readStore();
    const target = before.conversations[0];
    expect(target).toBeTruthy();

    const upsertSpy = vi
      .spyOn(backendClient, "upsertConversation")
      .mockRejectedValue(new Error("backend unavailable"));

    const store = await setConversationGroundTruth(target.id, "retention");
    expect(store).not.toBeNull();
    expect(
      store?.conversations.find((conversation) => conversation.id === target.id)
        ?.groundTruth
    ).toBe("retention");

    const after = await readStore();
    expect(
      after.conversations.find((conversation) => conversation.id === target.id)
        ?.groundTruth
    ).toBe("retention");
    expect(upsertSpy).toHaveBeenCalled();
  });

  it("fail-softs Unset via PATCH and still clears JSON", async () => {
    const before = await readStore();
    const target = before.conversations[0];
    await setConversationGroundTruth(target.id, "lead");

    const patchSpy = vi
      .spyOn(backendClient, "patchConversationGroundTruth")
      .mockRejectedValue(new Error("backend unavailable"));

    const store = await setConversationGroundTruth(target.id, null);
    expect(store?.conversations.find((c) => c.id === target.id)).not.toHaveProperty(
      "groundTruth"
    );
    expect(patchSpy).toHaveBeenCalledWith(target.tenantId, target.id, null);
  });

  it("dual-writes a labeled value via conversation upsert", async () => {
    const before = await readStore();
    const target = before.conversations[0];
    const upsertSpy = vi
      .spyOn(backendClient, "upsertConversation")
      .mockResolvedValue({
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        tenant_id: target.tenantId,
        conversation_id: target.id,
        channel: target.channel,
        customer_name: target.customerName ?? null,
        started_at: target.startedAt,
        external_id: target.externalId ?? null,
        ground_truth: "upsell",
        created_at: target.startedAt,
        updated_at: target.startedAt,
        messages: [],
      });

    await setConversationGroundTruth(target.id, "upsell");

    expect(upsertSpy).toHaveBeenCalledWith(
      target.tenantId,
      expect.objectContaining({
        conversation_id: target.id,
        ground_truth: "upsell",
      })
    );
  });
});

describe("readStore cold-start hydrate", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it("does not GET conversations when store.json already exists", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
    const getSpy = vi.spyOn(backendClient, "getConversations");
    const signalsSpy = vi.spyOn(backendClient, "getTenantSignals");

    const store = await readStore();

    expect(store.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(getSpy).not.toHaveBeenCalled();
    expect(signalsSpy).not.toHaveBeenCalled();
  });

  it("resetStore still seeds testing.json without hydrating", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    const wipeSpy = vi.spyOn(backendClient, "wipeTenantData");
    const getSpy = vi.spyOn(backendClient, "getConversations");
    const signalsSpy = vi.spyOn(backendClient, "getTenantSignals");

    const store = await resetStore();

    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(store.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(
      store.conversations.some((c) => c.id === "conv_eeshan_kulkarni_41")
    ).toBe(
      true
    );
    expect(store.taxonomyOverrides).toEqual({});
    expect(store.taxonomyOverrides?.lead?.negativePhrases).toBeUndefined();
    expect(store.taxonomyOverrides?.upsell?.phrases).toBeUndefined();
    // Reset Demo must not apply the Partner Demo lift baseline (4).
    expect(store.pilot?.baselineOpportunities).toBe(0);
    expect(store.pilot?.lastUploadedFileName).toBe("Groww_batch_02");
    expect(getSpy).not.toHaveBeenCalled();
    expect(signalsSpy).not.toHaveBeenCalled();
  });

  it("resetStoreWithWipe reports wipeFailed when FastAPI is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    const wipeSpy = vi
      .spyOn(backendClient, "wipeTenantData")
      .mockRejectedValue(new Error("Signal Score backend unreachable"));

    const { store, wipe } = await resetStoreWithWipe();

    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(wipe.ok).toBe(false);
    expect(wipe.error).toMatch(/unreachable|unavailable/i);
    expect(store.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
  });
});

describe("mergeTaxonomyOverrides", () => {
  it("unions phrases and negatives case-insensitively without dropping existing terms", () => {
    const merged = mergeTaxonomyOverrides(
      {
        lead: { phrases: ["Demat account"], negativePhrases: ["foo"] },
      },
      {
        lead: {
          phrases: ["demat account"],
          negativePhrases: ["bar"],
        },
        upsell: { phrases: ["portfolio review"] },
      }
    );
    expect(merged.lead?.phrases).toEqual(["Demat account"]);
    expect(merged.lead?.negativePhrases).toEqual(["foo", "bar"]);
    expect(merged.upsell?.phrases).toEqual(["portfolio review"]);
  });
});

describe("addTaxonomyOverride", () => {
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

  it("rejects blank values before writing", async () => {
    await expect(addTaxonomyOverride("lead", "phrases", "  ")).rejects.toThrow(
      "Override value is required"
    );
    const after = await readStore();
    expect(after.taxonomyOverrides).toEqual({});
  });

  it("trims and persists a phrase onto the store overrides", async () => {
    await addTaxonomyOverride("upsell", "negativePhrases", "  first time  ");
    const after = await readStore();
    expect(after.taxonomyOverrides?.upsell?.negativePhrases).toEqual(["first time"]);
  });

  it("refuses canonical mutations in postgres mode when taxonomy Neon is disabled", async () => {
    vi.stubEnv("SIOONA_STATE_MODE", "postgres");
    vi.stubEnv("SIOONA_TAXONOMY_NEON", "0");
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.includes("/pilot")) return Response.json({ tenant_id: "tenant_demo" });
        if (url.includes("/detection-resume")) return Response.json({ tenant_id: "tenant_demo" });
        if (url.includes("/taxonomy-overrides")) return Response.json({});
        if (url.includes("/uploads")) return Response.json([]);
        if (url.includes("/conversations")) return Response.json([]);
        if (url.includes("/signals")) return Response.json({ predictions: [], next_cursor: null });
        if (url.includes("/supervised-actions")) return Response.json([]);
        return Response.json({});
      })
    );
    await expect(
      addTaxonomyOverride("lead", "phrases", "new phrase")
    ).rejects.toThrow("Canonical taxonomy destination disabled; mutation refused.");
    const fresh = await readStore();
    expect(fresh.taxonomyOverrides?.lead?.phrases).toBeUndefined();
    vi.unstubAllEnvs();
  });
});

describe("supervised retention email actions", () => {
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

  it("persists a draft for a high-confidence retention signal and logs it", async () => {
    const store = await readStore();
    store.signals.push({
      id: "sig_ret_store",
      tenantId: store.tenant.id,
      conversationId: store.conversations[0]?.id ?? "conv_x",
      type: "retention",
      score: 0.92,
      confidence: 0.92,
      summary: "Closing",
      suggestedAction: "Call",
      evidence: ['quote: "I will close my account"'],
      status: "new",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    if (store.conversations[0]) {
      store.conversations[0].customerName = "Anita";
    }
    await writeStore(store);

    const created = await persistSupervisedActions();
    expect(created.some((action) => action.signalId === "sig_ret_store")).toBe(
      true
    );

    const after = await readStore();
    const draft = after.supervisedActions?.find(
      (action) => action.signalId === "sig_ret_store"
    );
    expect(draft?.status).toBe("pending");
    expect(draft?.body).toContain("Anita");
    expect(
      after.actionLogs?.some(
        (event) =>
          event.event === "generated" && event.signalId === "sig_ret_store"
      )
    ).toBe(true);
  });

  it("records a dismiss decision without sending", async () => {
    const store = await readStore();
    store.signals.push({
      id: "sig_ret_dismiss",
      tenantId: store.tenant.id,
      conversationId: store.conversations[0]?.id ?? "conv_x",
      type: "retention",
      score: 0.9,
      confidence: 0.9,
      summary: "Leaving",
      suggestedAction: "Call",
      evidence: ['quote: "I am leaving"'],
      status: "new",
      createdAt: "2026-09-01T00:00:00.000Z",
    });
    await writeStore(store);
    const [action] = await persistSupervisedActions();
    const target =
      action ??
      (await readStore()).supervisedActions?.find(
        (item) => item.signalId === "sig_ret_dismiss"
      );
    expect(target).toBeTruthy();

    const result = await decideSupervisedAction(target!.id, "dismissed");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.status).toBe("dismissed");

    const after = await readStore();
    expect(
      after.supervisedActions?.find((item) => item.id === target!.id)?.status
    ).toBe("dismissed");
    expect(
      after.actionLogs?.some((event) => event.event === "dismissed")
    ).toBe(true);
  });

  describe("canonical Postgres and tenant isolation (CB-10)", () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    it("prevents demo or sample data from overwriting a live tenant", async () => {
      const demoStore = await readStore();
      expect(demoStore.tenant.id).toBe(DEMO_TENANT_ID);

      await expect(
        runWithTenant("tenant_live_partner", async () => {
          await writeStore(demoStore);
        })
      ).rejects.toThrow(TenantIsolationError);
    });

    it("prevents cross-tenant store writes between different non-demo tenants", async () => {
      const storeA = emptyStoreForTenant("tenant_alpha");

      await expect(
        runWithTenant("tenant_beta", async () => {
          await writeStore(storeA);
        })
      ).rejects.toThrow(TenantIsolationError);
    });

    it("in postgres mode, live tenants bypass local JSON files", async () => {
      process.env.SIOONA_STATE_MODE = "postgres";
      const { promises: fs } = await import("node:fs");
      const mkdir = vi.spyOn(fs, "mkdir");
      const writeFile = vi.spyOn(fs, "writeFile");
      const rename = vi.spyOn(fs, "rename");
      const liveStore = emptyStoreForTenant("tenant_gamma");
      liveStore.conversations.push({
        id: "conv_gamma_1",
        customerName: "Gamma User",
        source: "upload",
        status: "new",
        signals: [],
        timestamp: new Date().toISOString(),
      });

      // In postgres mode, writing does not persist a local JSON file
      await runWithTenant("tenant_gamma", async () => {
        await writeStore(liveStore);
      });
      expect(mkdir).not.toHaveBeenCalled();
      expect(writeFile).not.toHaveBeenCalled();
      expect(rename).not.toHaveBeenCalled();

      // Reading live tenant in postgres mode hydrates from Neon rather than local file
      await expect(runWithTenant("tenant_gamma", () => readStore())).rejects.toThrow("Canonical pilot read unavailable");
    });
  });
});
