import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  compareToBaseline,
  f1Score,
  gateExitCode,
  loadArtifactSchema,
  loadThresholds,
  missingSchemaKeys,
  scoreCorpus,
  wilson95,
  type ArtifactMeta,
  type GateArtifact,
  type ScoredRow,
  type Thresholds,
} from "./compare";

const dir = dirname(fileURLToPath(import.meta.url));

const meta: ArtifactMeta = {
  git_sha: "abc",
  git_dirty: false,
  corpus: { id: "gold-v1", split: "validation", manifest_sha256: "f".repeat(64), n: 0 },
  route: {
    route_version: "detect:primary:qwen/qwen3.8-27b|openai/gpt-oss-20b",
    models: ["qwen/qwen3.8-27b", "openai/gpt-oss-20b"],
    prompt_version: "final-intent-recent-complete-turns-v2",
    mode: "replay",
  },
};

function row(partial: Partial<ScoredRow> & Pick<ScoredRow, "id" | "gold">): ScoredRow {
  return {
    surfaced: [],
    explicitNone: false,
    screenedOut: false,
    completed: true,
    failed: false,
    quotes: [],
    injectionAttack: null,
    tenantFailure: false,
    ...partial,
  };
}

function thresholds(partial: Partial<Thresholds> = {}): Thresholds {
  return {
    ...loadThresholds(),
    min_items_per_type: 1,
    require_holdout: false,
    ...partial,
  };
}

const holdout = { sha256: "a".repeat(64), n: 40 };

describe("eval gate metrics", () => {
  it("uses a Wilson interval and leaves empty denominators null", () => {
    const interval = wilson95(1, 2);
    expect(interval[0]).not.toBeNull();
    expect(interval[1]).not.toBeNull();
    expect(interval[0]!).toBeGreaterThan(0);
    expect(interval[0]!).toBeLessThan(0.5);
    expect(interval[1]!).toBeGreaterThan(0.5);
    expect(interval[1]!).toBeLessThan(1);
    expect(wilson95(0, 0)).toEqual([null, null]);
    expect(f1Score(0.5, 1)).toBeCloseTo(2 / 3);
    expect(f1Score(null, 1)).toBeNull();
    expect(f1Score(0, 0)).toBe(0);

    const empty = scoreCorpus([], meta);
    expect(empty.corpus.n).toBe(0);
    expect(empty.fp_per_100).toBeNull();
    expect(empty.abstention_rate).toBeNull();
    expect(empty.coverage.rate).toBeNull();
    expect(empty.cost.unknown_cost_fraction).toBeNull();
    expect(empty.latency_ms).toEqual({ p50: null, p95: null });
    for (const label of ["retention", "upsell", "lead", "none"] as const) {
      expect(empty.per_type[label].precision).toBeNull();
      expect(empty.per_type[label].recall).toBeNull();
      expect(empty.per_type[label].f1).toBeNull();
      expect(empty.per_type[label].precision_ci95).toEqual([null, null]);
      expect(empty.per_type[label].n_precision).toBe(0);
      expect(empty.per_type[label].n_recall).toBe(0);
    }
    expect(missingSchemaKeys(empty, loadArtifactSchema())).toEqual([]);
  });

  it("counts a screened-out positive as a false negative and reports fp per 100", () => {
    const artifact = scoreCorpus(
      [
        row({ id: "screened", gold: "retention", screenedOut: true }),
        row({
          id: "wrong",
          gold: "upsell",
          surfaced: ["retention"],
          quotes: [{ text: "quote", valid: true }],
        }),
      ],
      meta
    );
    expect(artifact.per_type.retention.fn).toBe(1);
    expect(artifact.per_type.retention.tp).toBe(0);
    expect(artifact.per_type.retention.fp).toBe(1);
    expect(artifact.per_type.retention.recall).toBe(0);
    expect(artifact.per_type.retention.n_recall).toBe(1);
    expect(artifact.per_type.none.fp).toBe(0);
    expect(artifact.fp_per_100).toBe(50);
    expect(artifact.per_type.retention.precision).toBe(0);
    expect(artifact.per_type.retention.precision_ci95[0]).not.toBeNull();
    expect(artifact.coverage.screened_out).toBe(1);
  });

  it("rejects validity, injection, and tenant failures", () => {
    const base = scoreCorpus(
      [
        row({
          id: "r",
          gold: "retention",
          surfaced: ["retention"],
          quotes: [
            { text: "ok", valid: true },
            { text: "bad", valid: false },
          ],
        }),
        row({ id: "u", gold: "upsell", surfaced: ["upsell"], quotes: [{ text: "ok", valid: true }] }),
        row({ id: "l", gold: "lead", surfaced: ["lead"], quotes: [{ text: "ok", valid: true }] }),
        row({ id: "n", gold: "none", explicitNone: true }),
      ],
      meta
    );
    expect(base.evidence_validity.rate).toBeCloseTo(0.75);
    const validity = compareToBaseline({
      current: base,
      baseline: base,
      thresholds: thresholds(),
      holdout,
    });
    expect(validity.ok).toBe(false);
    expect(validity.failures.map((failure) => failure.code)).toContain("evidence_validity");
    expect(gateExitCode(validity.ok)).toBe(1);

    const injected = scoreCorpus(
      [
        row({
          id: "r",
          gold: "none",
          surfaced: ["retention"],
          injectionAttack: "retention",
          quotes: [{ text: "ok", valid: true }],
        }),
      ],
      meta
    );
    expect(injected.injection_critical_failures).toBe(1);
    const injection = compareToBaseline({
      current: injected,
      baseline: injected,
      thresholds: thresholds({ min_items_per_type: 0, min_surfaced_evidence_validity: 0 }),
      holdout,
    });
    expect(injection.failures.map((failure) => failure.code)).toContain("injection_critical");

    const leased = structuredClone(base);
    leased.evidence_validity = { valid: 1, surfaced: 1, rate: 1 };
    leased.tenant_failures = 1;
    const tenant = compareToBaseline({
      current: leased,
      baseline: leased,
      thresholds: thresholds(),
      holdout,
    });
    expect(tenant.failures.map((failure) => failure.code)).toContain("tenant_failure");
  });

  it("fails closed on holdout, dirty git, sample size, and per-type drops", () => {
    const good = scoreCorpus(
      [
        row({ id: "r", gold: "retention", surfaced: ["retention"], quotes: [{ text: "q", valid: true }] }),
        row({ id: "u", gold: "upsell", surfaced: ["upsell"], quotes: [{ text: "q", valid: true }] }),
        row({ id: "l", gold: "lead", surfaced: ["lead"], quotes: [{ text: "q", valid: true }] }),
        row({ id: "n", gold: "none", explicitNone: true }),
      ],
      meta
    );
    const same = compareToBaseline({
      current: good,
      baseline: good,
      thresholds: thresholds(),
      holdout,
    });
    expect(same.ok).toBe(true);
    expect(gateExitCode(true)).toBe(0);

    const missingHoldout = compareToBaseline({
      current: good,
      baseline: good,
      thresholds: thresholds({ require_holdout: true }),
      holdout: { sha256: null, n: null },
    });
    expect(missingHoldout.ok).toBe(false);
    expect(missingHoldout.failures.map((failure) => failure.code)).toEqual(["holdout_missing"]);

    const dirty = structuredClone(good);
    dirty.git_dirty = true;
    expect(
      compareToBaseline({ current: dirty, baseline: good, thresholds: thresholds(), holdout }).failures.map(
        (failure) => failure.code
      )
    ).toContain("git_dirty");

    expect(
      compareToBaseline({
        current: good,
        baseline: null,
        thresholds: thresholds(),
        holdout,
      }).failures.map((failure) => failure.code)
    ).toContain("baseline_missing");

    expect(
      compareToBaseline({
        current: good,
        baseline: good,
        thresholds: thresholds({ min_items_per_type: 30 }),
        holdout,
      }).failures.map((failure) => failure.code)
    ).toContain("min_items");

    const wide = thresholds({
      max_per_type_precision_drop_pp: 50,
      max_per_type_recall_drop_pp: 50,
    });
    const dropped = structuredClone(good);
    dropped.per_type.retention.precision = 0.25;
    const drop = compareToBaseline({
      current: dropped,
      baseline: good,
      thresholds: wide,
      holdout,
    });
    expect(drop.failures.map((failure) => failure.code)).toContain("precision_drop");

    const atLimit = structuredClone(good);
    atLimit.per_type.retention.precision = 0.5;
    expect(
      compareToBaseline({
        current: atLimit,
        baseline: good,
        thresholds: wide,
        holdout,
      }).failures.map((failure) => failure.code)
    ).not.toContain("precision_drop");

    const unavailable = structuredClone(good);
    unavailable.per_type.upsell.recall = null;
    expect(
      compareToBaseline({
        current: unavailable,
        baseline: good,
        thresholds: thresholds(),
        holdout,
      }).failures.map((failure) => failure.code)
    ).toContain("recall_unavailable");
  });

  it("does not import the pilot SignalScore helpers", () => {
    const source = readFileSync(join(dir, "compare.ts"), "utf8");
    expect(source.includes("src/lib/eval")).toBe(false);
    expect(source.includes("reviewPrecision")).toBe(false);
    expect(source.includes("computeEvalMetrics")).toBe(false);
    expect(source.includes("skip" + "If")).toBe(false);
    const approved = loadThresholds();
    expect(approved.require_holdout).toBe(true);
    expect(approved.min_items_per_type).toBe(30);
    expect(approved.max_per_type_precision_drop_pp).toBe(2);
    expect(approved.min_surfaced_evidence_validity).toBe(1);
  });

  it("rejects a zero filled into an empty denominator", () => {
    const empty = scoreCorpus([], meta);
    const forged = structuredClone(empty) as GateArtifact;
    forged.per_type.retention.precision = 0;
    forged.fp_per_100 = 0;
    const result = compareToBaseline({
      current: forged,
      baseline: null,
      thresholds: thresholds({ min_items_per_type: 0, min_surfaced_evidence_validity: 0 }),
      holdout,
    });
    expect(result.failures.map((failure) => failure.detail)).toEqual(
      expect.arrayContaining(["retention precision", "fp_per_100"])
    );
  });

  it("rejects every missing baseline type bucket", () => {
    const rows = [
      row({ id: "r", gold: "retention", surfaced: ["retention"], quotes: [{ text: "q", valid: true }] }),
      row({ id: "u", gold: "upsell", surfaced: ["upsell"], quotes: [{ text: "q", valid: true }] }),
      row({ id: "l", gold: "lead", surfaced: ["lead"], quotes: [{ text: "q", valid: true }] }),
      row({ id: "n", gold: "none", explicitNone: true }),
    ];
    const current = scoreCorpus(rows, meta);
    for (const missing of ["retention", "upsell", "lead", "none"] as const) {
      const baseline = structuredClone(current) as GateArtifact;
      delete (baseline.per_type as Partial<GateArtifact["per_type"]>)[missing];
      const result = compareToBaseline({ current, baseline, thresholds: thresholds(), holdout });
      expect(result.failures).toContainEqual({ code: "baseline_shape", detail: `per_type.${missing}` });
    }

    const baseline = structuredClone(current) as GateArtifact;
    baseline.per_type = {} as GateArtifact["per_type"];
    const result = compareToBaseline({ current, baseline, thresholds: thresholds(), holdout });
    expect(result.ok).toBe(false);
    expect(result.failures.filter((failure) => failure.code === "baseline_shape")).toHaveLength(4);
  });
});
