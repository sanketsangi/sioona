import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { EXPECTED_TESTING_JSON } from "./testing-json-eval";
import {
  addTaxonomyOverride,
  mergeTaxonomyOverrides,
  readStore,
  resetStore,
  resetStoreWithWipe,
  setConversationGroundTruth,
  setSignalActed,
  setSignalFeedback,
} from "./store";

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

  it("undoes acted back to reviewed and keeps feedback", async () => {
    const before = await readStore();
    const target = before.signals[0];
    await setSignalFeedback(target.id, "incorrect", "not churn");
    await setSignalActed(target.id, true);

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
});
