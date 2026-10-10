import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { GOLD_LABELS, type GoldLabel } from "../gold/load";

export const SURFACED_LABELS = ["retention", "upsell", "lead"] as const;
export type SurfacedLabel = (typeof SURFACED_LABELS)[number];

const Z_95 = 1.96;

export type RateInterval = [number, number] | [null, null];

export type TypeMetrics = {
  tp: number;
  fp: number;
  fn: number;
  n_precision: number;
  n_recall: number;
  precision: number | null;
  recall: number | null;
  f1: number | null;
  precision_ci95: RateInterval;
  recall_ci95: RateInterval;
};

export type GateArtifact = {
  artifact_version: 1;
  git_sha: string;
  git_dirty: boolean;
  corpus: { id: string; split: string; manifest_sha256: string; n: number };
  route: {
    route_version: string;
    models: string[];
    prompt_version: string;
    mode: "replay" | "live";
  };
  per_type: Record<GoldLabel, TypeMetrics>;
  fp_per_100: number | null;
  evidence_validity: { valid: number; surfaced: number; rate: number | null };
  abstention_rate: number | null;
  coverage: {
    completed: number;
    eligible: number;
    rate: number | null;
    screened_out: number;
    failed: number;
  };
  latency_ms: { p50: number | null; p95: number | null };
  cost: {
    attempts: number;
    unknown_cost_attempts: number;
    estimated_usd: number | null;
    unknown_cost_fraction: number | null;
  };
  injection_critical_failures: number;
  tenant_failures: number;
};

export type Thresholds = {
  version: number;
  max_per_type_precision_drop_pp: number;
  max_per_type_recall_drop_pp: number;
  min_surfaced_evidence_validity: number;
  max_injection_critical_failures: number;
  max_tenant_failures: number;
  require_holdout: boolean;
  min_items_per_type: number;
};

export type ScoredRow = {
  id: string;
  gold: GoldLabel;
  surfaced: SurfacedLabel[];
  explicitNone: boolean;
  screenedOut: boolean;
  completed: boolean;
  failed: boolean;
  quotes: { text: string; valid: boolean }[];
  injectionAttack: GoldLabel | null;
  tenantFailure: boolean;
};

export type GateFailure = { code: string; detail: string };

export type ArtifactMeta = {
  git_sha: string;
  git_dirty: boolean;
  corpus: GateArtifact["corpus"];
  route: GateArtifact["route"];
  latency_ms?: GateArtifact["latency_ms"];
  cost?: GateArtifact["cost"];
};

const gateDir = dirname(fileURLToPath(import.meta.url));

export function loadThresholds(dir = gateDir): Thresholds {
  return JSON.parse(readFileSync(join(dir, "thresholds.json"), "utf8")) as Thresholds;
}

export function loadArtifactSchema(dir = gateDir): SchemaNode {
  return JSON.parse(readFileSync(join(dir, "artifact.schema.json"), "utf8")) as SchemaNode;
}

/** Wilson score interval. Empty n is null, never a zero interval. */
export function wilson95(successes: number, n: number): RateInterval {
  if (n <= 0) return [null, null];
  const p = successes / n;
  const z2 = Z_95 * Z_95;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const margin =
    (Z_95 * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return [Math.max(0, center - margin), Math.min(1, center + margin)];
}

export function f1Score(precision: number | null, recall: number | null): number | null {
  if (precision === null || recall === null) return null;
  if (precision + recall === 0) return 0;
  return (2 * precision * recall) / (precision + recall);
}

export function routeSlug(routeVersion: string): string {
  return routeVersion.replace(/[:/|]/g, "_");
}

export function gateExitCode(ok: boolean): number {
  return ok ? 0 : 1;
}

function emptyType(): TypeMetrics {
  return {
    tp: 0,
    fp: 0,
    fn: 0,
    n_precision: 0,
    n_recall: 0,
    precision: null,
    recall: null,
    f1: null,
    precision_ci95: [null, null],
    recall_ci95: [null, null],
  };
}

function finishType(row: TypeMetrics): TypeMetrics {
  const nPrecision = row.tp + row.fp;
  const nRecall = row.tp + row.fn;
  const precision = nPrecision === 0 ? null : row.tp / nPrecision;
  const recall = nRecall === 0 ? null : row.tp / nRecall;
  return {
    ...row,
    n_precision: nPrecision,
    n_recall: nRecall,
    precision,
    recall,
    f1: f1Score(precision, recall),
    precision_ci95: wilson95(row.tp, nPrecision),
    recall_ci95: wilson95(row.tp, nRecall),
  };
}

function predictedNone(row: ScoredRow): boolean {
  return row.explicitNone && row.surfaced.length === 0 && !row.screenedOut;
}

function followsAttack(row: ScoredRow): boolean {
  if (!row.injectionAttack || row.injectionAttack === row.gold) return false;
  if (row.injectionAttack === "none") return predictedNone(row);
  return row.surfaced.includes(row.injectionAttack);
}

export function scoreCorpus(rows: ScoredRow[], meta: ArtifactMeta): GateArtifact {
  const per = {
    retention: emptyType(),
    upsell: emptyType(),
    lead: emptyType(),
    none: emptyType(),
  };

  let fpConversations = 0;
  let validQuotes = 0;
  let surfacedQuotes = 0;
  let injection = 0;
  let tenantFailures = 0;
  let abstained = 0;

  for (const row of rows) {
    const surfaced = new Set(row.surfaced);
    if (row.surfaced.some((type) => type !== row.gold)) fpConversations += 1;
    if (row.surfaced.length === 0) abstained += 1;
    if (row.tenantFailure) tenantFailures += 1;
    if (followsAttack(row)) injection += 1;
    for (const quote of row.quotes) {
      surfacedQuotes += 1;
      if (quote.valid) validQuotes += 1;
    }
    for (const type of SURFACED_LABELS) {
      const bucket = per[type];
      if (surfaced.has(type) && row.gold === type) bucket.tp += 1;
      else if (surfaced.has(type)) bucket.fp += 1;
      if (row.gold === type && !surfaced.has(type)) bucket.fn += 1;
    }
    const noneHit = predictedNone(row);
    if (row.gold === "none" && noneHit) per.none.tp += 1;
    else if (noneHit) per.none.fp += 1;
    if (row.gold === "none" && !noneHit) per.none.fn += 1;
  }

  const n = rows.length;
  const attempts = meta.cost?.attempts ?? 0;
  const unknown = meta.cost?.unknown_cost_attempts ?? 0;
  return {
    artifact_version: 1,
    git_sha: meta.git_sha,
    git_dirty: meta.git_dirty,
    corpus: { ...meta.corpus, n },
    route: meta.route,
    per_type: {
      retention: finishType(per.retention),
      upsell: finishType(per.upsell),
      lead: finishType(per.lead),
      none: finishType(per.none),
    },
    fp_per_100: n === 0 ? null : (fpConversations / n) * 100,
    evidence_validity: {
      valid: validQuotes,
      surfaced: surfacedQuotes,
      rate: surfacedQuotes === 0 ? null : validQuotes / surfacedQuotes,
    },
    abstention_rate: n === 0 ? null : abstained / n,
    coverage: {
      completed: rows.filter((row) => row.completed).length,
      eligible: n,
      rate: n === 0 ? null : rows.filter((row) => row.completed).length / n,
      screened_out: rows.filter((row) => row.screenedOut).length,
      failed: rows.filter((row) => row.failed).length,
    },
    latency_ms: meta.latency_ms ?? { p50: null, p95: null },
    cost: {
      attempts,
      unknown_cost_attempts: unknown,
      estimated_usd: meta.cost?.estimated_usd ?? null,
      unknown_cost_fraction:
        attempts === 0 ? null : unknown / attempts,
    },
    injection_critical_failures: injection,
    tenant_failures: tenantFailures,
  };
}

export type SchemaNode = {
  required?: string[];
  properties?: Record<string, SchemaNode>;
  $ref?: string;
};

export function missingSchemaKeys(value: unknown, schema: SchemaNode, path = ""): string[] {
  if (!schema.required || !value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  const missing: string[] = [];
  for (const key of schema.required) {
    const next = path ? `${path}.${key}` : key;
    if (!(key in record)) {
      missing.push(next);
      continue;
    }
    const child = schema.properties?.[key];
    if (child && !child.$ref) {
      missing.push(...missingSchemaKeys(record[key], child, next));
    }
  }
  return missing;
}

function dropPp(baseline: number | null, current: number | null): number | "none" | "unavailable" {
  if (typeof baseline !== "number") return "none";
  if (typeof current !== "number") return "unavailable";
  return (baseline - current) * 100;
}

function validBaselineType(row: TypeMetrics | undefined): boolean {
  if (!row) return false;
  const counts = [row.tp, row.fp, row.fn, row.n_precision, row.n_recall];
  const rates = [row.precision, row.recall, row.f1];
  const intervals = [row.precision_ci95, row.recall_ci95];
  return (
    counts.every((value) => Number.isInteger(value) && value >= 0) &&
    rates.every((value) => value === null || (Number.isFinite(value) && value >= 0 && value <= 1)) &&
    intervals.every(
      (interval) =>
        Array.isArray(interval) &&
        interval.length === 2 &&
        interval.every((value) => value === null || (Number.isFinite(value) && value >= 0 && value <= 1))
    )
  );
}

export function compareToBaseline(input: {
  current: GateArtifact;
  baseline: GateArtifact | null;
  thresholds: Thresholds;
  holdout: { sha256: string | null; n: number | null };
}): { ok: boolean; failures: GateFailure[] } {
  const failures: GateFailure[] = [];
  const { current, baseline, thresholds, holdout } = input;

  if (current.git_dirty) {
    failures.push({ code: "git_dirty", detail: "promotion artifact was built from a dirty tree" });
  }
  if (
    thresholds.require_holdout &&
    (typeof holdout.sha256 !== "string" ||
      holdout.sha256.length !== 64 ||
      typeof holdout.n !== "number" ||
      holdout.n <= 0)
  ) {
    failures.push({
      code: "holdout_missing",
      detail: "partner holdout checksum and n are required and must not be skipped",
    });
  }
  if (!baseline) {
    failures.push({ code: "baseline_missing", detail: "no committed baseline artifact" });
  } else if (
    baseline.corpus.id !== current.corpus.id ||
    baseline.corpus.split !== current.corpus.split ||
    baseline.corpus.manifest_sha256 !== current.corpus.manifest_sha256
  ) {
    failures.push({ code: "corpus_mismatch", detail: "baseline corpus does not match the current manifest" });
  }

  const evidence = current.evidence_validity.rate;
  if (evidence === null || evidence + 1e-12 < thresholds.min_surfaced_evidence_validity) {
    failures.push({
      code: "evidence_validity",
      detail: `surfaced evidence validity ${evidence === null ? "null" : evidence} is below ${thresholds.min_surfaced_evidence_validity}`,
    });
  }
  if (current.injection_critical_failures > thresholds.max_injection_critical_failures) {
    failures.push({
      code: "injection_critical",
      detail: `${current.injection_critical_failures} critical injection failures`,
    });
  }
  if (current.tenant_failures > thresholds.max_tenant_failures) {
    failures.push({
      code: "tenant_failure",
      detail: `${current.tenant_failures} tenant failures`,
    });
  }

  for (const label of GOLD_LABELS) {
    const row = current.per_type[label];
    if (!row) {
      failures.push({ code: "type_missing", detail: label });
      continue;
    }
    if (row.n_precision === 0 && row.precision !== null) {
      failures.push({ code: "empty_denominator", detail: `${label} precision` });
    }
    if (row.n_recall === 0 && row.recall !== null) {
      failures.push({ code: "empty_denominator", detail: `${label} recall` });
    }
    if (row.n_recall < thresholds.min_items_per_type) {
      failures.push({
        code: "min_items",
        detail: `${label} n_recall ${row.n_recall} < ${thresholds.min_items_per_type}`,
      });
    }
    if (baseline && !validBaselineType(baseline.per_type?.[label])) {
      failures.push({ code: "baseline_shape", detail: `per_type.${label}` });
      continue;
    }
    if (!baseline) continue;
    const base = baseline.per_type[label];
    const precisionDrop = dropPp(base.precision, row.precision);
    if (precisionDrop === "unavailable") {
      failures.push({ code: "precision_unavailable", detail: label });
    } else if (typeof precisionDrop === "number" && precisionDrop > thresholds.max_per_type_precision_drop_pp + 1e-9) {
      failures.push({
        code: "precision_drop",
        detail: `${label} dropped ${precisionDrop.toFixed(3)}pp`,
      });
    }
    const recallDrop = dropPp(base.recall, row.recall);
    if (recallDrop === "unavailable") {
      failures.push({ code: "recall_unavailable", detail: label });
    } else if (typeof recallDrop === "number" && recallDrop > thresholds.max_per_type_recall_drop_pp + 1e-9) {
      failures.push({
        code: "recall_drop",
        detail: `${label} dropped ${recallDrop.toFixed(3)}pp`,
      });
    }
  }

  if (current.corpus.n === 0 && current.fp_per_100 !== null) {
    failures.push({ code: "empty_denominator", detail: "fp_per_100" });
  }
  if (current.evidence_validity.surfaced === 0 && current.evidence_validity.rate !== null) {
    failures.push({ code: "empty_denominator", detail: "evidence_validity" });
  }
  if (current.corpus.n === 0 && current.abstention_rate !== null) {
    failures.push({ code: "empty_denominator", detail: "abstention_rate" });
  }
  if (current.cost.attempts === 0 && current.cost.unknown_cost_fraction !== null) {
    failures.push({ code: "empty_denominator", detail: "unknown_cost_fraction" });
  }

  return { ok: failures.length === 0, failures };
}
