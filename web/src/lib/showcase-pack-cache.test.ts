import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearShowcasePackCache,
  getOrBuildShowcasePack,
  isShowcasePackCached,
  storeFromShowcasePack,
  warmShowcasePacks,
} from "./showcase-pack-cache";
import {
  EXPECTED_TESTING_JSON,
  EXPECTED_ZERODHA_BATCH02,
  ZERODHA_BATCH02_SAMPLE_NAME,
} from "./testing-json-eval";

describe("showcase-pack-cache", () => {
  beforeEach(() => {
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
    clearShowcasePackCache();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    clearShowcasePackCache();
  });

  it("builds and caches Sample and Partner Demo packs", async () => {
    expect(isShowcasePackCached("sample")).toBe(false);
    const sample = await getOrBuildShowcasePack("sample");
    expect(isShowcasePackCached("sample")).toBe(true);
    expect(sample.conversations).toHaveLength(
      EXPECTED_TESTING_JSON.conversations,
    );
    expect(sample.signals.length).toBeGreaterThan(0);

    const again = await getOrBuildShowcasePack("sample");
    expect(again).toBe(sample);

    const partner = await getOrBuildShowcasePack("partner");
    expect(partner.sampleName).toBe(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(partner.conversations).toHaveLength(
      EXPECTED_ZERODHA_BATCH02.conversations,
    );
  });

  it("warmShowcasePacks loads both packs", async () => {
    const warmed = await warmShowcasePacks();
    expect(warmed).toEqual({ sample: true, partner: true });
    expect(isShowcasePackCached("sample")).toBe(true);
    expect(isShowcasePackCached("partner")).toBe(true);
  });

  it("storeFromShowcasePack clones a ready Insights keep-set", () => {
    const pack = {
      kind: "partner" as const,
      sampleName: ZERODHA_BATCH02_SAMPLE_NAME,
      conversations: [],
      messages: [],
      signals: [],
      detectLlm: {
        enabled: false,
        candidates: 0,
        attempted: 0,
        added: 0,
        failed: 0,
        skipped: 0,
      },
    };
    const store = storeFromShowcasePack(pack, { applyDemoBaseline: true });
    expect(store.pilot?.lastUploadedFileName).toBe(ZERODHA_BATCH02_SAMPLE_NAME);
    expect(store.pilot?.baselineOpportunities).toBe(4);
  });
});
