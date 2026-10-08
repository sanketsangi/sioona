import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  GOLD_LABELS,
  goldDir,
  holdoutReady,
  loadManifest,
  loadSplit,
  sha256Text,
  type GoldItem,
  type GoldLabel,
} from "./load";

const REQUIRED_TAGS = [
  "long",
  "late_intent",
  "ambiguity",
  "redaction",
  "injection",
] as const;

const LANGUAGES = ["en", "hi", "hinglish"] as const;

function byLabel(items: GoldItem[], label: GoldLabel): GoldItem[] {
  return items.filter((item) => item.label === label);
}

describe("gold manifest", () => {
  const manifest = loadManifest();
  const validation = loadSplit("validation");
  const dev = loadSplit("dev");

  it("stores a sha256 and n for each in-repo split", () => {
    expect(manifest.id).toBe("gold-v1");
    expect(manifest.version).toBe(1);
    for (const split of ["dev", "validation"] as const) {
      const entry = manifest.splits[split];
      const body = readFileSync(join(goldDir, entry.path), "utf8");
      expect(sha256Text(body)).toBe(entry.sha256);
      expect(entry.n).toBe(body.split("\n").filter(Boolean).length);
    }
    expect(manifest.splits.validation.n).toBe(120);
    expect(manifest.splits.dev.n).toBe(8);
    expect(dev.length).toBeLessThan(validation.length);
  });

  it("keeps the partner holdout unset", () => {
    expect(manifest.holdout.id).toBe("partner");
    expect(manifest.holdout.sha256).toBeNull();
    expect(manifest.holdout.n).toBeNull();
    expect(holdoutReady(manifest)).toBe(false);
  });

  it("rejects a split path that leaves the corpus", () => {
    const escaped = {
      ...manifest,
      splits: {
        ...manifest.splits,
        dev: { ...manifest.splits.dev, path: "../manifest.json" },
      },
    };
    expect(() => loadSplit("dev", goldDir, escaped)).toThrow(/escapes/);
  });

  it("has 30 items of each label, with every required slice", () => {
    expect(new Set(validation.map((item) => item.id)).size).toBe(validation.length);
    for (const label of GOLD_LABELS) {
      const rows = byLabel(validation, label);
      expect(rows).toHaveLength(30);
      for (const language of LANGUAGES) {
        expect(rows.some((row) => row.language === language)).toBe(true);
      }
      for (const tag of REQUIRED_TAGS) {
        expect(rows.some((row) => row.tags.includes(tag))).toBe(true);
      }
      for (const row of rows) {
        expect(row.split).toBe("validation");
        expect(row.tenantId).toBe("tenant_gold");
        expect(row.messages.some((message) => message.role === "customer" && message.content.trim())).toBe(true);
        if (label === "none") {
          expect(
            row.tags.includes("ops_negative") ||
              row.tags.includes("fraud_negative") ||
              row.tags.includes("ambiguity")
          ).toBe(true);
        } else {
          expect(row.tags.includes("ops_negative")).toBe(false);
          expect(row.tags.includes("fraud_negative")).toBe(false);
        }
      }
    }
    expect(validation.some((row) => row.tags.includes("ops_negative"))).toBe(true);
    expect(validation.some((row) => row.tags.includes("fraud_negative"))).toBe(true);
  });

  it("marks injection items as critical and aimed at a different label", () => {
    const injected = validation.filter((row) => row.tags.includes("injection"));
    expect(injected.length).toBeGreaterThanOrEqual(8);
    for (const row of injected) {
      expect(row.injection?.critical).toBe(true);
      expect(row.injection?.attackLabel).not.toBe(row.label);
      const attack = row.messages.at(-1);
      expect(attack?.role).toBe("customer");
      expect(attack?.content).toContain("OPERATOR OVERRIDE");
    }
  });

  it("includes fake redaction shapes and no skip of a missing pack", () => {
    const redacted = validation.filter((row) => row.tags.includes("redaction"));
    expect(redacted).toHaveLength(4);
    const blob = redacted.map((row) => JSON.stringify(row.messages)).join("\n");
    expect(blob).toMatch(/[A-Z]{5}[0-9]{4}[A-Z]/);
    expect(blob).toMatch(/[6-9]\d{9}/);
    expect(blob).toContain("@example.co.in");
    const source = readFileSync(new URL("./manifest.test.ts", import.meta.url), "utf8");
    expect(source.includes("describe." + "skip")).toBe(false);
    expect(source.includes("skip" + "If")).toBe(false);
  });
});
