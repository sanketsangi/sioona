import { describe, expect, it } from "vitest";
import { ZERODHA_BATCH01_ADAPT_OVERRIDES } from "../data/fixtures/zerodha-batch01-overrides";
import { runDetection } from "./detect";
import { computeEvalMetrics } from "./eval";
import { existsSync, readFileSync } from "fs";
import {
  listConfusionExamples,
  parseTestingJsonDocument,
} from "./testing-json-eval";
import { toStoreRecords } from "./ingest";
import type { StoreData } from "./types";

const BATCH01 =
  "/Users/sanket/Documents/Synthetic-Data/data/companies/zerodha/Batch-01/batch_01.json";

describe("ZERODHA_BATCH01_ADAPT_OVERRIDES", () => {
  it("covers lead / upsell / retention override fields", () => {
    expect(ZERODHA_BATCH01_ADAPT_OVERRIDES.lead?.phrases?.length).toBeGreaterThan(
      0
    );
    expect(
      ZERODHA_BATCH01_ADAPT_OVERRIDES.lead?.negativePhrases?.length
    ).toBeGreaterThan(0);
    expect(
      ZERODHA_BATCH01_ADAPT_OVERRIDES.upsell?.phrases?.length
    ).toBeGreaterThan(0);
    expect(
      ZERODHA_BATCH01_ADAPT_OVERRIDES.retention?.phrases?.length
    ).toBeGreaterThan(0);
  });

  it("lifts batch_01 recall without adding FPs when the pack is present", () => {
    if (!existsSync(BATCH01)) return;

    const inputs = parseTestingJsonDocument(readFileSync(BATCH01, "utf8"));
    const { conversations, messages } = toStoreRecords(inputs, "tenant_demo");

    const baseSignals = runDetection(conversations, messages, "tenant_demo");
    const adaptSignals = runDetection(
      conversations,
      messages,
      "tenant_demo",
      ZERODHA_BATCH01_ADAPT_OVERRIDES
    );

    const baseStore: StoreData = {
      tenant: {
        id: "tenant_demo",
        name: "zerodha batch01",
        createdAt: "2026-08-15T00:00:00.000Z",
      },
      conversations,
      messages,
      signals: baseSignals,
      pilot: { baselineOpportunities: 0 },
    };
    const adaptStore: StoreData = {
      ...baseStore,
      signals: adaptSignals,
      taxonomyOverrides: ZERODHA_BATCH01_ADAPT_OVERRIDES,
    };

    const base = computeEvalMetrics(baseStore);
    const adapt = computeEvalMetrics(adaptStore);
    const adaptFp = listConfusionExamples(adaptStore).filter(
      (c) => c.kind === "false_positive"
    ).length;

    expect(adapt.labeledRecall ?? 0).toBeGreaterThan(base.labeledRecall ?? 0);
    expect(adapt.labeledPrecision ?? 0).toBeGreaterThanOrEqual(
      base.labeledPrecision ?? 0
    );
    expect(adaptFp).toBe(0);
    expect(adapt.truePositives).toBeGreaterThan(base.truePositives);
  });
});
