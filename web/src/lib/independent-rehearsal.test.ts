import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseIngestDocument } from "./ingest";

const dir = "data/samples/pilot/independent-rehearsal";

describe("independent synthetic rehearsal", () => {
  it("preserves a fixed independent reference without exposing labels to ingestion", () => {
    const csv = readFileSync(`${dir}/rehearsal_week_1.csv`, "utf8");
    const reference = JSON.parse(readFileSync(`${dir}/reference.json`, "utf8"));
    expect(createHash("sha256").update(csv).digest("hex")).toBe(reference.corpus_sha256);
    const parsed = parseIngestDocument("rehearsal_week_1.csv", csv).conversations;
    expect(parsed).toHaveLength(100);
    expect(parsed.every((chat) => chat.groundTruth === undefined)).toBe(true);
    expect(parsed[0].messages).toHaveLength(102);
    expect(new Set(reference.review_sample_external_ids).size).toBe(20);
    const actualIds = new Set(parsed.map((chat) => chat.externalId));
    expect(reference.review_sample_external_ids.every((id: string) => actualIds.has(id))).toBe(true);
    const labels = reference.ground_truth.map((row: { expected_label: string }) => row.expected_label);
    expect(labels.filter((label: string) => label !== "none")).toHaveLength(55);
    expect(reference.partner_outcomes).toBeNull();
    expect(reference.paid_decision).toBeNull();
  });
});
