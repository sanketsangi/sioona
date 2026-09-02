import { describe, expect, it } from "vitest";
import { platformPageFetches } from "./platform-page-data";

describe("platformPageFetches", () => {
  it("loads Insights queue + windowed score, not all-time score", () => {
    expect(platformPageFetches("insights")).toEqual({
      insightsQueue: true,
      windowedScore: true,
      allTimeScore: false,
    });
  });

  it("loads Eval queue, windowed score, and all-time score", () => {
    expect(platformPageFetches("eval")).toEqual({
      insightsQueue: true,
      windowedScore: true,
      allTimeScore: true,
    });
  });

  it("skips Insights and SignalScore fetches on Upload and Taxonomy", () => {
    expect(platformPageFetches("upload")).toEqual({
      insightsQueue: false,
      windowedScore: false,
      allTimeScore: false,
    });
    expect(platformPageFetches("taxonomy")).toEqual({
      insightsQueue: false,
      windowedScore: false,
      allTimeScore: false,
    });
  });
});
