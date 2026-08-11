import { describe, expect, it } from "vitest";
import {
  EXPECTED_TESTING_JSON,
  customerNameFromExternalId,
  formatConfusionExamples,
  formatTestingJsonMetrics,
  loadTestingJsonEval,
  mapTestingLabelsToGroundTruth,
} from "./testing-json-eval";

describe("testing.json synthetic eval", () => {
  it("maps multi-label and out-of-scope signals per policy", () => {
    expect(
      mapTestingLabelsToGroundTruth([
        { signal: "churn_risk" },
        { signal: "complaint" },
      ])
    ).toBe("retention");
    expect(
      mapTestingLabelsToGroundTruth([
        { signal: "retention_risk" },
        { signal: "upsell" },
      ])
    ).toBe("retention");
    expect(mapTestingLabelsToGroundTruth([{ signal: "fraud" }])).toBe("none");
    expect(mapTestingLabelsToGroundTruth([{ signal: "complaint" }])).toBe(
      "none"
    );
    expect(mapTestingLabelsToGroundTruth([{ signal: "lead" }])).toBe("lead");
  });

  it("derives customerName from externalId (rahul_mehta_29 → Rahul Mehta)", () => {
    expect(customerNameFromExternalId("rahul_mehta_29")).toBe("Rahul Mehta");
    expect(customerNameFromExternalId("priya_sharma_22")).toBe("Priya Sharma");
    expect(customerNameFromExternalId("wa-1001")).toBeNull();
    expect(customerNameFromExternalId("")).toBeNull();

    const result = loadTestingJsonEval();
    const named = result.store.conversations.filter((c) => c.customerName);
    expect(named.length).toBe(EXPECTED_TESTING_JSON.conversations);
    expect(
      result.store.conversations.find((c) => c.externalId === "rahul_mehta_29")
        ?.customerName
    ).toBe("Rahul Mehta");
    expect(result.store.signals[0]?.summary).toMatch(
      /^(Rahul|Priya|Amit|[A-Z][a-z]+)/
    );
  });

  it("loads via adapter and reports overall + per-type metrics (measurement)", () => {
    const result = loadTestingJsonEval();
    const { store, metrics, confusion } = result;

    expect(store.conversations).toHaveLength(EXPECTED_TESTING_JSON.conversations);
    expect(metrics.labeledConversations).toBe(
      EXPECTED_TESTING_JSON.conversations
    );

    const lead = metrics.byType.find((row) => row.type === "lead");
    const retention = metrics.byType.find((row) => row.type === "retention");
    const upsell = metrics.byType.find((row) => row.type === "upsell");

    expect(lead?.labeledCount).toBe(EXPECTED_TESTING_JSON.lead);
    expect(retention?.labeledCount).toBe(EXPECTED_TESTING_JSON.retention);
    expect(upsell?.labeledCount).toBe(EXPECTED_TESTING_JSON.upsell);

    const noneCount = store.conversations.filter(
      (c) => c.groundTruth === "none"
    ).length;
    expect(noneCount).toBe(EXPECTED_TESTING_JSON.none);

    expect(metrics.byType).toHaveLength(3);
    expect(typeof metrics.labeledPrecision).toBe("number");
    expect(typeof metrics.labeledRecall).toBe("number");

    // Measurement baseline — do not gate on P/R = 1.0.
    const summary = formatTestingJsonMetrics(metrics);
    const topFp = formatConfusionExamples(
      confusion.filter((c) => c.kind === "false_positive"),
      8
    );
    const topFn = formatConfusionExamples(
      confusion.filter((c) => c.kind === "false_negative"),
      10
    );
    console.log("\n=== testing.json synthetic eval ===\n" + summary);
    console.log("\n=== top false positives ===\n" + topFp);
    console.log("\n=== top false negatives ===\n" + topFn + "\n");

    expect(summary).toContain("labeled=41");
    expect(summary).toContain("lead:");
    expect(summary).toContain("retention:");
    expect(summary).toContain("upsell:");
    expect(Array.isArray(confusion)).toBe(true);
  });
});
