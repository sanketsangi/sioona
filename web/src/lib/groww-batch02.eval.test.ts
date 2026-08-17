import { existsSync, readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDetection } from "./detect";
import { computeEvalMetrics } from "./eval";
import { parseIngestDocument, parseIngestFile, toStoreRecords } from "./ingest";
import { containsPii } from "./redact";
import {
  formatConfusionExamples,
  formatTestingJsonMetrics,
  listConfusionExamples,
} from "./testing-json-eval";
import type { SignalType, StoreData } from "./types";

/**
 * Groww Batch-02 lives in the Synthetic-Data repo — never copy it into Sioona
 * or commit `*.local.csv`. Skip when the pack is absent (CI / other machines).
 */
const BATCH02_DIR =
  "/Users/sanket/Documents/Synthetic-Data/data/companies/groww/Batch-02";
const BATCH01_JSON =
  "/Users/sanket/Documents/Synthetic-Data/data/companies/groww/Batch-01/batch_01.json";

const JSON_FILE = path.join(BATCH02_DIR, "batch_02.json");
const CSV_FILE = path.join(
  BATCH02_DIR,
  "real-partner-export.week3.local.csv"
);
const MANIFEST_FILE = path.join(BATCH02_DIR, "batch_02_manifest.json");

const TENANT_ID = "tenant_demo";
const CUTOFF_EXCLUSIVE = "2026-08-17T19:34:00.000Z";
const CUTOFF_MS = Date.parse(CUTOFF_EXCLUSIVE);

const PACK_PRESENT =
  existsSync(JSON_FILE) && existsSync(CSV_FILE) && existsSync(MANIFEST_FILE);

interface Batch02Manifest {
  conversation_count: number;
  cutoff_exclusive: string;
  product_ground_truth_counts: {
    lead: number;
    upsell: number;
    retention: number;
    none: number;
  };
  channel_counts: Record<string, number>;
  returning: { count: number; ids: string[] };
  planted_detect_phrases: Record<SignalType, string[]>;
}

function loadManifest(): Batch02Manifest {
  return JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Batch02Manifest;
}

function ingestNamed(filename: string, absolutePath: string) {
  return parseIngestDocument(filename, readFileSync(absolutePath, "utf8"));
}

function countGroundTruth(conversations: { groundTruth?: string }[]) {
  const counts = { lead: 0, retention: 0, upsell: 0, none: 0 };
  for (const conversation of conversations) {
    const gt = conversation.groundTruth ?? "none";
    if (gt in counts) counts[gt as keyof typeof counts] += 1;
  }
  return counts;
}

function countChannels(conversations: { channel: string }[]) {
  const counts: Record<string, number> = {};
  for (const conversation of conversations) {
    counts[conversation.channel] = (counts[conversation.channel] ?? 0) + 1;
  }
  return counts;
}

function afterCutoff(iso: string): boolean {
  const ms = Date.parse(iso);
  return Number.isFinite(ms) && ms > CUTOFF_MS;
}

function loadHeuristicStore(
  filename: string,
  absolutePath: string
): StoreData {
  const doc = ingestNamed(filename, absolutePath);
  const { conversations, messages } = toStoreRecords(
    doc.conversations,
    TENANT_ID
  );
  const signals = runDetection(conversations, messages, TENANT_ID);
  return {
    tenant: {
      id: TENANT_ID,
      name: "Groww Batch-02 eval",
      createdAt: "2026-08-18T00:00:00.000Z",
    },
    conversations,
    messages,
    signals,
    pilot: { baselineOpportunities: 0 },
  };
}

describe.skipIf(!PACK_PRESENT)("Groww Batch-02 pack (local Synthetic-Data)", () => {
  beforeEach(() => {
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ingests JSON: 100 conversations, GT mix, channels, timestamps after cutoff", () => {
    const manifest = loadManifest();
    const doc = ingestNamed("batch_02.json", JSON_FILE);
    const { conversations, messages } = toStoreRecords(
      doc.conversations,
      TENANT_ID
    );

    expect(doc.format).toBe("sioona_json");
    expect(conversations).toHaveLength(100);
    expect(manifest.conversation_count).toBe(100);
    expect(new Set(conversations.map((c) => c.externalId)).size).toBe(100);

    expect(countGroundTruth(conversations)).toEqual(
      manifest.product_ground_truth_counts
    );
    expect(countChannels(conversations)).toEqual(manifest.channel_counts);

    expect(manifest.cutoff_exclusive).toBe(CUTOFF_EXCLUSIVE);
    expect(conversations.every((c) => afterCutoff(c.startedAt))).toBe(true);
    expect(messages.every((m) => afterCutoff(m.timestamp))).toBe(true);
  });

  it("ingests CSV with JSON externalId and groundTruth parity", () => {
    const jsonDoc = ingestNamed("batch_02.json", JSON_FILE);
    const csvDoc = ingestNamed("real-partner-export.week3.local.csv", CSV_FILE);

    expect(csvDoc.format).toBe("sioona_csv");
    expect(csvDoc.conversations).toHaveLength(100);

    const jsonById = new Map(
      jsonDoc.conversations.map((c) => [c.externalId, c])
    );
    const csvIds = csvDoc.conversations.map((c) => c.externalId);
    expect(new Set(csvIds).size).toBe(100);
    expect([...jsonById.keys()].sort()).toEqual([...csvIds].sort());

    for (const csvConv of csvDoc.conversations) {
      const jsonConv = jsonById.get(csvConv.externalId);
      expect(jsonConv, csvConv.externalId).toBeDefined();
      expect(csvConv.groundTruth).toBe(jsonConv!.groundTruth);
    }
  });

  it("keeps 15 returning Batch-01 ids for upsert", () => {
    const manifest = loadManifest();
    const jsonIds = new Set(
      ingestNamed("batch_02.json", JSON_FILE).conversations.map(
        (c) => c.externalId
      )
    );

    expect(manifest.returning.count).toBe(15);
    expect(manifest.returning.ids).toHaveLength(15);
    expect(new Set(manifest.returning.ids).size).toBe(15);
    expect(manifest.returning.ids.every((id) => jsonIds.has(id))).toBe(true);

    if (!existsSync(BATCH01_JSON)) return;

    const batch01Ids = new Set(
      parseIngestFile("batch_01.json", readFileSync(BATCH01_JSON, "utf8")).map(
        (c) => c.externalId
      )
    );
    expect(manifest.returning.ids.every((id) => batch01Ids.has(id))).toBe(true);
  });

  it("heuristic Detect emits ≥5 signals and planted phrases hit (measurement P/R)", () => {
    const manifest = loadManifest();
    const store = loadHeuristicStore("batch_02.json", JSON_FILE);
    const metrics = computeEvalMetrics(store);
    const confusion = listConfusionExamples(store);

    expect(store.taxonomyOverrides).toBeUndefined();
    expect(store.signals.length).toBeGreaterThanOrEqual(5);
    expect(metrics.predictedSignals).toBe(store.signals.length);

    const byExternalId = new Map(
      store.conversations.map((c) => [c.externalId, c.id])
    );
    for (const type of ["lead", "upsell", "retention"] as const) {
      const planted = manifest.planted_detect_phrases[type];
      expect(planted.length).toBeGreaterThan(0);
      for (const externalId of planted) {
        const conversationId = byExternalId.get(externalId);
        expect(conversationId, `missing planted id ${externalId}`).toBeDefined();
        const hits = store.signals.filter(
          (s) => s.conversationId === conversationId && s.type === type
        );
        expect(
          hits.length,
          `planted ${type} ${externalId} should fire`
        ).toBeGreaterThan(0);
      }
    }

    // Measurement only — do not gate go/no-go on labeled P/R.
    expect(typeof metrics.labeledPrecision === "number").toBe(true);
    expect(typeof metrics.labeledRecall === "number").toBe(true);
    expect(metrics.labeledConversations).toBe(100);

    const summary = formatTestingJsonMetrics(metrics);
    console.log("\n=== Groww Batch-02 heuristic eval (measurement) ===\n" + summary);
    console.log(
      "\n=== top false negatives ===\n" +
        formatConfusionExamples(
          confusion.filter((c) => c.kind === "false_negative"),
          8
        ) +
        "\n"
    );
    expect(summary).toContain("labeled=100");
    expect(summary).toContain("lead:");
    expect(summary).toContain("retention:");
    expect(summary).toContain("upsell:");
  });

  it("stores no raw PII after ingest redaction", () => {
    const store = loadHeuristicStore("batch_02.json", JSON_FILE);
    const joined = store.messages.map((m) => m.content).join("\n");

    expect(store.messages.every((m) => !containsPii(m.content))).toBe(true);
    expect(joined).toMatch(/\[email\]|\[pan\]|\[phone\]|\[aadhaar\]|\[account\]/);
    expect(joined).not.toMatch(/\b\d{10}\b/);
    expect(joined).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/i);
    expect(joined).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });
});
