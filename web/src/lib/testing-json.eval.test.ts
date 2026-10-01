import { describe, expect, it } from "vitest";
import {
  EXPECTED_TESTING_JSON,
  customerNameFromExternalId,
  formatConfusionExamples,
  formatTestingJsonMetrics,
  loadTestingJsonEval,
  mapTestingLabelsToGroundTruth,
} from "./testing-json-eval";
import { pseudonymCustomerName } from "./redact";

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

  it("derives customerName from externalId (eeshan_kulkarni_41 → Eeshan Kulkarni)", () => {
    expect(customerNameFromExternalId("eeshan_kulkarni_41")).toBe(
      "Eeshan Kulkarni"
    );
    expect(customerNameFromExternalId("rahul_mehta_29")).toBe("Rahul Mehta");
    expect(customerNameFromExternalId("wa-1001")).toBeNull();
    expect(customerNameFromExternalId("")).toBeNull();

    const result = loadTestingJsonEval();
    const named = result.store.conversations.filter((c) => c.customerName);
    expect(named.length).toBe(EXPECTED_TESTING_JSON.conversations);
    expect(
      result.store.conversations.find(
        (c) => c.externalId === "eeshan_kulkarni_41"
      )
        ?.customerName
    ).toBe(pseudonymCustomerName("Eeshan Kulkarni"));
    expect(result.store.signals[0]?.summary).toMatch(
      /^(Eeshan|Rahul|Priya|Amit|[A-Z][a-z]+)/
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

    expect(summary).toContain("labeled=100");
    expect(summary).toContain("lead:");
    expect(summary).toContain("retention:");
    expect(summary).toContain("upsell:");
    expect(Array.isArray(confusion)).toBe(true);

    // Precision-first Detect gate (heuristics; Detect v2 off). Hybrid lift is in detect-llm.test.ts.
    expect(metrics.labeledPrecision).toBe(1);
    expect(metrics.falsePositives).toBe(0);
    expect(metrics.labeledRecall).toBe(1);
    expect(metrics.falseNegatives).toBe(0);
    // trisha_mehta_07 recovered via family+competitor proximity (not bare competitor names).
    const fnIds = confusion
      .filter((c) => c.kind === "false_negative")
      .map((c) => c.externalId);
    expect(fnIds).toEqual([]);
  });
});
