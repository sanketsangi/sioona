import { existsSync, readFileSync } from "fs";
import path from "path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { runDetection } from "./detect";
import { computeEvalMetrics } from "./eval";
import { parseIngestDocument, toStoreRecords } from "./ingest";
import { containsPii } from "./redact";
import {
  formatConfusionExamples,
  formatTestingJsonMetrics,
  listConfusionExamples,
} from "./testing-json-eval";
import type { SignalType, StoreData } from "./types";

/**
 * Dhan Batch-01 lives in the Synthetic-Data repo — never copy it into Sioona
 * or commit the JSON pack. Skip when the pack is absent (CI / other machines).
 */
const BATCH01_DIR =
  "/Users/sanket/Documents/Synthetic-Data/data/companies/dhan/Batch-01";

const JSON_FILE = path.join(BATCH01_DIR, "dhan_batch_01.json");
const MANIFEST_FILE = path.join(BATCH01_DIR, "batch_01_manifest.json");

const TENANT_ID = "tenant_demo";
const CUTOFF_EXCLUSIVE = "2026-09-21T19:00:00.000Z";
const CUTOFF_MS = Date.parse(CUTOFF_EXCLUSIVE);

const PACK_PRESENT = existsSync(JSON_FILE) && existsSync(MANIFEST_FILE);

interface Batch01Manifest {
  conversation_count: number;
  cutoff_exclusive: string;
  product_ground_truth_counts: {
    lead: number;
    upsell: number;
    retention: number;
    none: number;
  };
  channel_counts: Record<string, number>;
  planted_detect_phrases: Record<SignalType, string[]>;
}

function loadManifest(): Batch01Manifest {
  return JSON.parse(readFileSync(MANIFEST_FILE, "utf8")) as Batch01Manifest;
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
      name: "Dhan Batch-01 eval",
      createdAt: "2026-09-22T00:00:00.000Z",
    },
    conversations,
    messages,
    signals,
    pilot: { baselineOpportunities: 0 },
  };
}

describe.skipIf(!PACK_PRESENT)("Dhan Batch-01 pack (local Synthetic-Data)", () => {
  beforeEach(() => {
    vi.stubEnv("DETECT_LLM", "");
    vi.stubEnv("GROQ_API_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("ingests JSON: 100 conversations, GT mix, channels, timestamps after cutoff", () => {
    const manifest = loadManifest();
    const doc = ingestNamed("dhan_batch_01.json", JSON_FILE);
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

  it("heuristic Detect emits signals and planted phrases hit (measurement P/R)", () => {
    const manifest = loadManifest();
    const store = loadHeuristicStore("dhan_batch_01.json", JSON_FILE);
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
    console.log("\n=== Dhan Batch-01 heuristic eval (measurement) ===\n" + summary);
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
    const store = loadHeuristicStore("dhan_batch_01.json", JSON_FILE);
    const joined = store.messages.map((m) => m.content).join("\n");

    expect(store.messages.every((m) => !containsPii(m.content))).toBe(true);
    expect(joined).toMatch(/\[email\]|\[pan\]|\[phone\]|\[aadhaar\]|\[account\]/);
    expect(joined).not.toMatch(/\b\d{10}\b/);
    expect(joined).not.toMatch(/[A-Z]{5}\d{4}[A-Z]/i);
    expect(joined).not.toMatch(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/);
  });
});
