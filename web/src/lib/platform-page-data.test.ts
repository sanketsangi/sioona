import { describe, expect, it } from "vitest";
import {
  platformPageFetches,
  shouldDeferHomepagePredictionSync,
} from "./platform-page-data";

describe("platformPageFetches", () => {
  it("loads Insights queue + windowed score, not all-time score", () => {
    expect(platformPageFetches("insights")).toEqual({
      insightsQueue: true,
      windowedScore: true,
      allTimeScore: false,
      predictionSync: "defer",
    });
  });

  it("loads Eval queue, windowed score, and all-time score", () => {
    expect(platformPageFetches("eval")).toEqual({
      insightsQueue: true,
      windowedScore: true,
      allTimeScore: true,
      predictionSync: "defer",
    });
  });

  it("skips Insights, SignalScore, and prediction dual-write on Upload and Taxonomy", () => {
    expect(platformPageFetches("upload")).toEqual({
      insightsQueue: false,
      windowedScore: false,
      allTimeScore: false,
      predictionSync: "skip",
    });
    expect(platformPageFetches("taxonomy")).toEqual({
      insightsQueue: false,
      windowedScore: false,
      allTimeScore: false,
      predictionSync: "skip",
    });
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
