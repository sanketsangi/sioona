import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const GOLD_LABELS = ["retention", "upsell", "lead", "none"] as const;
export type GoldLabel = (typeof GOLD_LABELS)[number];
export type GoldLanguage = "en" | "hi" | "hinglish";
export type GoldSplitName = "dev" | "validation";

export type GoldMessage = {
  role: "customer" | "agent" | "system";
  content: string;
};

export type GoldInjection = {
  critical: true;
  attackLabel: GoldLabel;
};

export type GoldItem = {
  id: string;
  split: GoldSplitName;
  label: GoldLabel;
  language: GoldLanguage;
  tags: string[];
  customerName: string;
  channel: string;
  tenantId: string;
  messages: GoldMessage[];
  injection?: GoldInjection;
};

export type GoldManifest = {
  id: string;
  version: number;
  splits: Record<
    GoldSplitName,
    { path: string; sha256: string; n: number }
  >;
  holdout: { id: string; sha256: string | null; n: number | null };
};

export const goldDir = dirname(fileURLToPath(import.meta.url));

export function sha256Text(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}

export function loadManifest(dir = goldDir): GoldManifest {
  const raw = readFileSync(join(dir, "manifest.json"), "utf8");
  return JSON.parse(raw) as GoldManifest;
}

function splitFile(dir: string, relativePath: string): string {
  if (relativePath.includes("..") || relativePath.startsWith("/")) {
    throw new Error(`gold path escapes the corpus: ${relativePath}`);
  }
  const file = resolve(dir, relativePath);
  const root = resolve(dir);
  if (file !== root && !file.startsWith(`${root}/`)) {
    throw new Error(`gold path escapes the corpus: ${relativePath}`);
  }
  return file;
}

export function loadSplit(
  split: GoldSplitName,
  dir = goldDir,
  manifest = loadManifest(dir)
): GoldItem[] {
  const entry = manifest.splits[split];
  if (!entry) throw new Error(`missing gold split: ${split}`);
  const file = splitFile(dir, entry.path);
  const body = readFileSync(file, "utf8");
  const actual = sha256Text(body);
  if (actual !== entry.sha256) {
    throw new Error(`gold ${split} sha256 mismatch: ${actual}`);
  }
  const items = body
    .split("\n")
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as GoldItem);
  if (items.length !== entry.n) {
    throw new Error(`gold ${split} n ${items.length} != manifest ${entry.n}`);
  }
  return items;
}

export function holdoutReady(manifest: GoldManifest): boolean {
  return (
    typeof manifest.holdout.sha256 === "string" &&
    manifest.holdout.sha256.length === 64 &&
    typeof manifest.holdout.n === "number" &&
    manifest.holdout.n > 0
  );
}
