import { readFileSync } from "fs";
import path from "path";
import { describe, expect, it } from "vitest";
import { runDetection } from "./detect";
import { computeEvalMetrics } from "./eval";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import type { StoreData } from "./types";

const PACK_PATH = path.join(
  process.cwd(),
  "data/samples/partner-shaped-labeled.csv"
);

const TENANT_ID = "tenant_demo";

/** Expected labeled mix in partner-shaped-labeled.csv */
const EXPECTED = {
  labeledConversations: 16,
  lead: 4,
  retention: 3,
  upsell: 3,
  none: 6,
} as const;

function loadPartnerPackStore(): StoreData {
  const content = readFileSync(PACK_PATH, "utf8");
  const doc = parseIngestDocument("partner-shaped-labeled.csv", content);
  const { conversations, messages } = toStoreRecords(
    doc.conversations,
    TENANT_ID
  );
  const signals = runDetection(conversations, messages, TENANT_ID);

  return {
    tenant: {
      id: TENANT_ID,
      name: "Partner pack eval",
      createdAt: "2026-08-05T00:00:00.000Z",
    },
    conversations,
    messages,
    signals,
    pilot: { baselineOpportunities: 0 },
  };
}

describe("partner-shaped labeled pack", () => {
  it("loads via ingest and reports overall + per-type metrics", () => {
    const store = loadPartnerPackStore();
    const metrics = computeEvalMetrics(store);

    expect(store.conversations).toHaveLength(EXPECTED.labeledConversations);
    expect(metrics.labeledConversations).toBe(EXPECTED.labeledConversations);

    const lead = metrics.byType.find((row) => row.type === "lead");
    const retention = metrics.byType.find((row) => row.type === "retention");
    const upsell = metrics.byType.find((row) => row.type === "upsell");

    expect(lead?.labeledCount).toBe(EXPECTED.lead);
    expect(retention?.labeledCount).toBe(EXPECTED.retention);
    expect(upsell?.labeledCount).toBe(EXPECTED.upsell);

    expect(metrics.labeledPrecision).toBe(1);
    expect(metrics.labeledRecall).toBe(1);
    expect(metrics.byType).toHaveLength(3);
    expect(upsell?.precision).toBe(1);
    expect(upsell?.recall).toBe(1);
    expect(lead?.precision).toBe(1);
    expect(lead?.recall).toBe(1);
    expect(retention?.precision).toBe(1);
    expect(retention?.recall).toBe(1);

    // Ingest redacts PII-shaped values before store.
    const joined = store.messages.map((m) => m.content).join(" ");
    expect(joined).not.toMatch(/9876543210/);
    expect(joined).not.toMatch(/ananya\.rao@example\.com/i);
    expect(joined).not.toMatch(/ABCDE1234F/);
  });
});
