import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runPartnerDemo } from "./demo";
import { resetStore, readStore } from "./store";

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
  });

  it("resets fixtures and ingests Intercom + WhatsApp samples", async () => {
    const before = await readStore();
    const fixtureConvos = before.conversations.length;
    const fixtureSignals = before.signals.length;

    const result = await runPartnerDemo();

    expect(result.samples).toEqual([
      "sample-intercom.json",
      "sample-whatsapp.txt",
    ]);
    expect(result.importedConversations).toBeGreaterThan(0);
    expect(result.newSignals).toBeGreaterThan(0);
    expect(result.store.conversations.length).toBeGreaterThan(fixtureConvos);
    expect(result.store.signals.length).toBeGreaterThan(fixtureSignals);
    expect(
      result.store.conversations.some((c) => c.channel === "intercom")
    ).toBe(true);
    expect(
      result.store.conversations.some((c) => c.channel === "whatsapp")
    ).toBe(true);
    expect(result.baselineOpportunities).toBe(4);
    expect(result.store.pilot?.baselineOpportunities).toBe(4);
    expect(result.opportunityLift).toBeGreaterThan(0);
    expect(result.predictionSync).toEqual(
      expect.objectContaining({
        attempted: expect.any(Number),
        created: expect.any(Number),
        failed: expect.any(Number),
        skipped: expect.any(Number),
      })
    );
    expect(
      result.predictionSync.attempted + result.predictionSync.skipped
    ).toBeGreaterThan(0);
  });
});
