import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "./backend-client";
import { runPartnerDemo } from "./demo";
import { resetStore, readStore } from "./store";
import {
  EXPECTED_ZERODHA_BATCH02,
  ZERODHA_BATCH02_FILENAME,
} from "./zerodha-batch02";

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

  it("wipes then loads only zerodha_batch_02.json", async () => {
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
    expect(result.samples).toEqual([ZERODHA_BATCH02_FILENAME]);
    expect(result.importedConversations).toBe(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(result.newSignals).toBeGreaterThan(0);
    expect(result.store.conversations).toHaveLength(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(
      result.store.conversations.every((c) => c.id.startsWith("conv_zrdh_"))
    ).toBe(true);
    expect(result.store.messages.some((m) => /groww/i.test(m.content))).toBe(
      false
    );
    expect(result.store.signals.length).toBe(result.newSignals);
    expect(result.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(result.store.pilot?.lastUploadedFileName).toBe(
      ZERODHA_BATCH02_FILENAME
    );
    expect(putPilotSpy).toHaveBeenCalledWith(
      "tenant_demo",
      expect.objectContaining({
        last_uploaded_file_name: ZERODHA_BATCH02_FILENAME,
      })
    );
    expect(result.opportunityLift).toBeGreaterThan(0);
    expect(result.store.taxonomyOverrides).toEqual({});
    expect(result.store.taxonomyOverrides?.lead?.negativePhrases).toBeUndefined();
    expect(result.store.taxonomyOverrides?.upsell?.phrases).toBeUndefined();

    const afterReset = await readStore();
    expect(afterReset.conversations).toHaveLength(
      EXPECTED_ZERODHA_BATCH02.conversations
    );
    expect(
      afterReset.conversations.every((c) => c.id.startsWith("conv_zrdh_"))
    ).toBe(true);

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
        attempted: EXPECTED_ZERODHA_BATCH02.conversations,
        failed: EXPECTED_ZERODHA_BATCH02.conversations,
        created: 0,
      })
    );
    expect(result.detectLlm.enabled).toBe(false);

    const again = await runPartnerDemo();
    expect(again.store.conversations.map((c) => c.id).sort()).toEqual(
      result.store.conversations.map((c) => c.id).sort()
    );
    expect(again.store.pilot?.weeklyExportCount).toBeUndefined();
    expect(again.store.pilot?.lastUploadedFileName).toBe(
      ZERODHA_BATCH02_FILENAME
    );
    expect(putPilotSpy).toHaveBeenCalledTimes(2);
    expect(wipeSpy).toHaveBeenCalledTimes(2);
  });
});
