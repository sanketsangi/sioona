import { describe, expect, it } from "vitest";
import {
  SOURCE_TO_GT,
  mapTestingLabelsToGroundTruth,
} from "./label-ground-truth";

describe("mapTestingLabelsToGroundTruth", () => {
  it("returns none for missing, empty, or out-of-scope labels", () => {
    expect(mapTestingLabelsToGroundTruth(undefined)).toBe("none");
    expect(mapTestingLabelsToGroundTruth([])).toBe("none");
    expect(mapTestingLabelsToGroundTruth([{ signal: "unknown" }])).toBe("none");
    expect(mapTestingLabelsToGroundTruth([{ signal: "" }])).toBe("none");
    expect(mapTestingLabelsToGroundTruth([{}])).toBe("none");
    expect(mapTestingLabelsToGroundTruth([{ signal: "complaint" }])).toBe(
      "none"
    );
    expect(mapTestingLabelsToGroundTruth([{ signal: "fraud" }])).toBe("none");
  });

  it("trims, lowercases, and accepts numeric-looking signal ids", () => {
    expect(
      mapTestingLabelsToGroundTruth([{ signal: "  Churn_Risk  " }])
    ).toBe("retention");
    expect(
      mapTestingLabelsToGroundTruth([{ signal: "RETENTION_RISK" }])
    ).toBe("retention");
  });

  it("picks product priority retention > upsell > lead and ignores none-mapped labels", () => {
    expect(
      mapTestingLabelsToGroundTruth([
        { signal: "lead" },
        { signal: "upsell" },
        { signal: "complaint" },
      ])
    ).toBe("upsell");
    expect(
      mapTestingLabelsToGroundTruth([
        { signal: "lead" },
        { signal: "churn_risk" },
        { signal: "upsell" },
      ])
    ).toBe("retention");
    expect(mapTestingLabelsToGroundTruth([{ signal: "lead" }])).toBe("lead");
  });

  it("maps every SOURCE_TO_GT key the ingest/eval adapters rely on", () => {
    expect(SOURCE_TO_GT.lead).toBe("lead");
    expect(SOURCE_TO_GT.upsell).toBe("upsell");
    expect(SOURCE_TO_GT.churn_risk).toBe("retention");
    expect(SOURCE_TO_GT.retention_risk).toBe("retention");
    expect(SOURCE_TO_GT.complaint).toBe("none");
    expect(SOURCE_TO_GT.fraud).toBe("none");
  });
});
