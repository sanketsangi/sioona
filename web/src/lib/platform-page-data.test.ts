import { describe, expect, it } from "vitest";
import {
  platformPageFetches,
  shouldAwaitHomepagePilotRefresh,
  shouldDeferHomepagePilotRefresh,
  shouldDeferHomepagePredictionSync,
} from "./platform-page-data";

describe("platformPageFetches", () => {
  it("loads Insights queue + windowed score, not all-time score", () => {
    expect(platformPageFetches("insights")).toEqual({
      insightsQueue: true,
      windowedScore: true,
      allTimeScore: false,
      predictionSync: "defer",
      pilotRefresh: "defer",
    });
  });

  it("loads Eval queue, windowed score, and all-time score", () => {
    expect(platformPageFetches("eval")).toEqual({
      insightsQueue: true,
      windowedScore: true,
      allTimeScore: true,
      predictionSync: "defer",
      pilotRefresh: "defer",
    });
  });

  it("skips Insights, SignalScore, and prediction dual-write on Upload and Taxonomy", () => {
    expect(platformPageFetches("upload")).toEqual({
      insightsQueue: false,
      windowedScore: false,
      allTimeScore: false,
      predictionSync: "skip",
      pilotRefresh: "await",
    });
    expect(platformPageFetches("taxonomy")).toEqual({
      insightsQueue: false,
      windowedScore: false,
      allTimeScore: false,
      predictionSync: "skip",
      pilotRefresh: "skip",
    });
  });

  it("plans GET /pilot per view: await Upload, defer Insights/Eval, skip Taxonomy", () => {
    expect(platformPageFetches("upload").pilotRefresh).toBe("await");
    expect(platformPageFetches("insights").pilotRefresh).toBe("defer");
    expect(platformPageFetches("eval").pilotRefresh).toBe("defer");
    expect(platformPageFetches("taxonomy").pilotRefresh).toBe("skip");
  });
});

describe("shouldDeferHomepagePredictionSync", () => {
  it("never schedules POST /v1/predictions on Upload/Taxonomy", () => {
    expect(shouldDeferHomepagePredictionSync("skip", true)).toBe(false);
    expect(shouldDeferHomepagePredictionSync("skip", false)).toBe(false);
  });

  it("defers Insights/Eval dual-write only on cold start (never awaits TTFB)", () => {
    expect(shouldDeferHomepagePredictionSync("defer", true)).toBe(true);
    expect(shouldDeferHomepagePredictionSync("defer", false)).toBe(false);
  });
});

describe("homepage /pilot plan", () => {
  it("awaits GET /pilot only on Upload (cadence chrome)", () => {
    expect(shouldAwaitHomepagePilotRefresh("await")).toBe(true);
    expect(shouldAwaitHomepagePilotRefresh("defer")).toBe(false);
    expect(shouldAwaitHomepagePilotRefresh("skip")).toBe(false);
  });

  it("defers GET /pilot on Insights/Eval (never on Upload or Taxonomy)", () => {
    expect(shouldDeferHomepagePilotRefresh("defer")).toBe(true);
    expect(shouldDeferHomepagePilotRefresh("await")).toBe(false);
    expect(shouldDeferHomepagePilotRefresh("skip")).toBe(false);
  });
});
