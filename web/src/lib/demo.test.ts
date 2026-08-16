import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { runPartnerDemo } from "./demo";
import { resetStore, readStore } from "./store";
import { EXPECTED_TESTING_JSON } from "./testing-json-eval";

describe("runPartnerDemo", () => {
  beforeEach(async () => {
    // Avoid hanging when FastAPI is unreachable (no fetch timeout in client).
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

  it("resets and loads only testing.json showcase corpus", async () => {
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
    const result = await runPartnerDemo();

    expect(wipeSpy).toHaveBeenCalledWith("tenant_demo");
    expect(result.wipe.ok).toBe(true);
    expect(result.samples).toEqual(["testing.json"]);
    expect(result.importedConversations).toBe(EXPECTED_TESTING_JSON.conversations);
    expect(result.newSignals).toBeGreaterThan(0);
    expect(result.store.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );
    expect(result.store.signals.length).toBe(result.newSignals);
    expect(result.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(putPilotSpy).not.toHaveBeenCalled();
    expect(result.opportunityLift).toBeGreaterThan(0);
    expect(result.store.taxonomyOverrides).toEqual({});
    expect(result.store.taxonomyOverrides?.lead?.negativePhrases).toBeUndefined();
    expect(result.store.taxonomyOverrides?.upsell?.phrases).toBeUndefined();

    const afterReset = await readStore();
    expect(afterReset.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations
    );

    expect(result.predictionSync).toEqual(
      expect.objectContaining({
        attempted: expect.any(Number),
        created: expect.any(Number),
        updated: expect.any(Number),
        failed: expect.any(Number),
        skipped: expect.any(Number),
      })
    );
    expect(
      result.predictionSync.attempted + result.predictionSync.skipped
    ).toBeGreaterThan(0);
    expect(result.conversationSync).toEqual(
      expect.objectContaining({
        attempted: EXPECTED_TESTING_JSON.conversations,
        failed: EXPECTED_TESTING_JSON.conversations,
        created: 0,
      })
    );
    expect(result.detectLlm.enabled).toBe(false);

    const again = await runPartnerDemo();
    expect(again.store.conversations.map((c) => c.id).sort()).toEqual(
      result.store.conversations.map((c) => c.id).sort()
    );
    expect(again.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(putPilotSpy).not.toHaveBeenCalled();
    expect(wipeSpy).toHaveBeenCalledTimes(2);
  });
});
