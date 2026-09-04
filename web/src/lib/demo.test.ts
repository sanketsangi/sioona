import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { partnerDemoCompleteEvent, runPartnerDemo, runResetDemo } from "./demo";
import {
  partnerDemoStepSequence,
  type PartnerDemoProgress,
} from "./partner-demo-progress";
import { clearShowcasePackCache } from "./showcase-pack-cache";
import { resetStore, readStore } from "./store";
import {
  EXPECTED_TESTING_JSON,
  EXPECTED_ZERODHA_BATCH02,
  GROWW_TESTING_JSON_EXTERNAL_ID,
  ZERODHA_BATCH02_EXTERNAL_ID,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "./testing-json-eval";

function hasExternalId(store: { conversations: { id: string }[] }, id: string) {
  return store.conversations.some((c) => c.id === `conv_${id}`);
}

describe("runPartnerDemo", () => {
  beforeEach(async () => {
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
    clearShowcasePackCache();
    // Avoid hanging when FastAPI is unreachable (no fetch timeout in client).
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("backend unavailable in tests"))
    );
    await resetStore();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    clearShowcasePackCache();
  });

  it("writes preloaded Zerodha Batch-02 instantly (Neon wipe deferred)", async () => {
    const before = await readStore();
    expect(hasExternalId(before, GROWW_TESTING_JSON_EXTERNAL_ID)).toBe(true);

    const wipeSpy = vi
      .spyOn(backendClient, "wipeTenantData")
      .mockResolvedValue({
        conversations: 0,
        messages: 0,
        predictions: 0,
        feedback: 0,
        pilot_settings: 0,
      });
    const putPilotSpy = vi.spyOn(backendClient, "putPilotSettings");
    const progress: PartnerDemoProgress[] = [];
    const result = await runPartnerDemo({
      onProgress: (event) => {
        progress.push(event);
      },
    });

    // Hot path: wipe tick (deferred) → detect from pack → writeStore. No Neon wipe yet.
    expect(partnerDemoStepSequence(progress)).toEqual(["wipe", "detect"]);
    const detect = progress.filter((event) => event.step === "detect");
    expect(detect[0]).toMatchObject({
      done: 0,
      total: EXPECTED_ZERODHA_BATCH02.conversations,
    });
    expect(detect.at(-1)).toMatchObject({
      done: EXPECTED_ZERODHA_BATCH02.conversations,
      total: EXPECTED_ZERODHA_BATCH02.conversations,
    });
    expect(progress.some((event) => event.step === "sync_chats")).toBe(false);
    expect(progress.some((event) => event.step === "sync_signals")).toBe(false);
    expect(partnerDemoCompleteEvent(result).type).toBe("complete");
    expect(partnerDemoCompleteEvent(result).importedConversations).toBe(
      result.importedConversations
    );
    expect(partnerDemoCompleteEvent(result).wipeFailed).toBeUndefined();

    // Neon wipe is store-route after() — not on this hot path.
    expect(wipeSpy).not.toHaveBeenCalled();
    expect(result.wipe.ok).toBe(true);
    expect(result.samples).toEqual([ZERODHA_BATCH02_SAMPLE_NAME]);
    expect(result.importedConversations).toBe(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(result.newSignals).toBeGreaterThan(0);
    expect(result.store.conversations).toHaveLength(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(hasExternalId(result.store, ZERODHA_BATCH02_EXTERNAL_ID)).toBe(true);
    expect(hasExternalId(result.store, GROWW_TESTING_JSON_EXTERNAL_ID)).toBe(
      false
    );
    expect(result.store.signals.length).toBe(result.newSignals);
    expect(result.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(result.store.pilot?.lastUploadedFileName).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME
    );
    expect(putPilotSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        last_uploaded_file_name: ZERODHA_BATCH02_SAMPLE_NAME,
      })
    );
    expect(result.opportunityLift).toBeGreaterThan(0);
    expect(result.store.taxonomyOverrides).toEqual({});
    expect(result.store.taxonomyOverrides?.lead?.negativePhrases).toBeUndefined();
    expect(result.store.taxonomyOverrides?.upsell?.phrases).toBeUndefined();
    expect(result.store.taxonomyOverrides?.lead?.phrases).toBeUndefined();

    expect(result.predictionSync).toEqual({
      attempted: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
    });
    expect(result.conversationSync).toEqual({
      attempted: 0,
      created: 0,
      updated: 0,
      failed: 0,
      skipped: 0,
      messagesCreated: 0,
      messagesUpdated: 0,
    });
    expect(result.detectLlm.enabled).toBe(false);

    const againProgress: PartnerDemoProgress[] = [];
    const again = await runPartnerDemo({
      onProgress: (event) => {
        againProgress.push(event);
      },
    });
    // Second call hits in-memory cache — single detect tick at 100%.
    expect(
      againProgress.filter((event) => event.step === "detect")
    ).toHaveLength(1);
    expect(again.store.conversations.map((c) => c.id).sort()).toEqual(
      result.store.conversations.map((c) => c.id).sort()
    );
    expect(hasExternalId(again.store, GROWW_TESTING_JSON_EXTERNAL_ID)).toBe(
      false
    );
    expect(again.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(again.store.pilot?.lastUploadedFileName).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME
    );
    expect(putPilotSpy).toHaveBeenCalledTimes(2);
    expect(wipeSpy).not.toHaveBeenCalled();
  });

  it("runResetDemo loads Groww testing.json without the cold-demo baseline", async () => {
    const wipeSpy = vi
      .spyOn(backendClient, "wipeTenantData")
      .mockResolvedValue({
        conversations: 0,
        messages: 0,
        predictions: 0,
        feedback: 0,
        pilot_settings: 0,
      });
    const progress: PartnerDemoProgress[] = [];
    const result = await runResetDemo({
      onProgress: (event) => {
        progress.push(event);
      },
    });

    expect(partnerDemoStepSequence(progress)).toEqual(["wipe", "detect"]);
    expect(wipeSpy).not.toHaveBeenCalled();
    expect(result.wipe.ok).toBe(true);
    expect(result.importedConversations).toBe(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(hasExternalId(result.store, GROWW_TESTING_JSON_EXTERNAL_ID)).toBe(
      true
    );
    expect(hasExternalId(result.store, ZERODHA_BATCH02_EXTERNAL_ID)).toBe(
      false
    );
    expect(result.store.pilot?.baselineOpportunities).toBe(0);
    expect(result.store.pilot?.lastUploadedFileName).toBe("Groww_batch_02");
    expect(result.store.taxonomyOverrides).toEqual({});
    expect(partnerDemoCompleteEvent(result).wipeFailed).toBeUndefined();
  });

  it("Reset after Partner Demo returns Groww testing.json only", async () => {
    vi.spyOn(backendClient, "wipeTenantData").mockResolvedValue({
      conversations: 0,
      messages: 0,
      predictions: 0,
      feedback: 0,
      pilot_settings: 0,
    });

    const demo = await runPartnerDemo();
    expect(hasExternalId(demo.store, ZERODHA_BATCH02_EXTERNAL_ID)).toBe(true);
    expect(hasExternalId(demo.store, GROWW_TESTING_JSON_EXTERNAL_ID)).toBe(
      false
    );

    const restored = await resetStore();
    expect(restored.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(hasExternalId(restored, GROWW_TESTING_JSON_EXTERNAL_ID)).toBe(true);
    expect(hasExternalId(restored, ZERODHA_BATCH02_EXTERNAL_ID)).toBe(false);
    expect(restored.taxonomyOverrides).toEqual({});
  });

  it("restores a partner baseline after wipe instead of forcing cold-demo 4", async () => {
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

    const result = await runPartnerDemo();

    expect(result.baselineOpportunities).toBe(12);
    expect(result.store.pilot?.baselineOpportunities).toBe(12);
    expect(result.store.pilot?.baselineNote).toBe("partner agreed");
    expect(result.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(result.store.pilot?.lastUploadedFileName).toBe(
      ZERODHA_BATCH02_SAMPLE_NAME
    );
    expect(result.opportunityLift).toBe(
      new Set(result.store.signals.map((s) => s.conversationId)).size - 12
    );
    expect(putPilotSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        baseline_opportunities: 12,
        baseline_note: "partner agreed",
        last_uploaded_file_name: ZERODHA_BATCH02_SAMPLE_NAME,
      })
    );
  });

  it("keeps cold-demo baseline when Neon pilot is still the cold-demo pair", async () => {
    vi.spyOn(backendClient, "wipeTenantData").mockResolvedValue({
      conversations: 0,
      messages: 0,
      predictions: 0,
      feedback: 0,
      pilot_settings: 0,
    });
    vi.spyOn(backendClient, "getPilotSettings").mockResolvedValue({
      id: "pilot-cold",
      tenant_id: "tenant_demo",
      baseline_opportunities: 4,
      baseline_note:
        "Cold-demo estimate: what a busy desk typically flags without Shadow Mode. Replace with the partner’s real count on Eval.",
      weekly_export_count: null,
      last_uploaded_file_name: "Zerodha_batch_02",
      created_at: "2026-08-20T00:00:00.000Z",
      updated_at: "2026-08-20T00:00:00.000Z",
    });

    const result = await runPartnerDemo();
    expect(result.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.baselineOpportunities).toBe(4);
  });
});
