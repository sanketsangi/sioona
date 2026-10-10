import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DETECT_PROMPT_VERSION,
  detectRouteVersion,
  resetGroqPaceForTests,
} from "../../src/lib/detect-llm";
import type { InferenceAttempt } from "../../src/lib/ai/types";
import type { GoldItem, GoldManifest } from "../gold/load";
import { loadThresholds, type Thresholds } from "./compare";
import {
  recordReplay,
  resolveEvidenceAnchor,
  runGate,
  validateEvidenceAnchor,
  type EvalEvidenceAnchor,
  type ReplayCapture,
} from "./run-gate";

const manifest: GoldManifest = {
  id: "gold-v1",
  version: 1,
  splits: {
    dev: { path: "dev/items.jsonl", sha256: "b".repeat(64), n: 1 },
    validation: { path: "validation/items.jsonl", sha256: "c".repeat(64), n: 4 },
  },
  holdout: { sha256: "d".repeat(64), n: 12 },
};

function item(partial: Pick<GoldItem, "id" | "label" | "messages"> & Partial<GoldItem>): GoldItem {
  return {
    split: "validation",
    language: "en",
    tags: [],
    customerName: "Asha Mehta",
    channel: "whatsapp",
    tenantId: "tenant_gold",
    ...partial,
  };
}

const items: GoldItem[] = [
  item({
    id: "keep",
    label: "retention",
    messages: [
      { role: "customer", content: "I am closing my account and moving my money." },
      { role: "agent", content: "I have noted that." },
    ],
  }),
  item({
    id: "add-on",
    label: "upsell",
    messages: [{ role: "customer", content: "I already trade equity here and want a premium advisory plan." }],
  }),
  item({
    id: "new-account",
    label: "lead",
    messages: [{ role: "customer", content: "I want to open a demat account this week. What is the brokerage?" }],
  }),
  item({
    id: "ops",
    label: "none",
    tags: ["ops_negative"],
    messages: [{ role: "customer", content: "Please email the statement PDF." }],
  }),
];

const replay = new Map<string, string>([
  [
    "keep",
    JSON.stringify({
      signal: "retention_risk",
      confidence: 0.91,
      evidence: "I am closing my account and moving my money.",
      reason: "Customer will leave.",
    }),
  ],
  [
    "add-on",
    JSON.stringify({
      signal: "upsell_opportunity",
      confidence: 0.88,
      evidence: "I already trade equity here and want a premium advisory plan.",
      reason: "Existing customer wants advisory.",
    }),
  ],
  [
    "new-account",
    JSON.stringify({
      signal: "lead_intent",
      confidence: 0.9,
      evidence: "I want to open a demat account this week.",
      reason: "New account.",
    }),
  ],
  [
    "ops",
    JSON.stringify({ signal: "none", confidence: 0.2, evidence: "", reason: "Statement request." }),
  ],
]);

function replayCaptures(promptVersion = DETECT_PROMPT_VERSION): Map<string, ReplayCapture> {
  return new Map(
    [...replay].map(([itemId, content]) => [
      itemId,
      {
        item_id: itemId,
        content,
        route_version: detectRouteVersion(),
        prompt_version: promptVersion,
        corpus_sha256: manifest.splits.validation.sha256,
      },
    ])
  );
}

const git = { sha: "abc123", dirty: false };

function openThresholds(partial: Partial<Thresholds> = {}): Thresholds {
  return { ...loadThresholds(), min_items_per_type: 1, require_holdout: false, ...partial };
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  resetGroqPaceForTests();
});

describe("eval:gate replay", () => {
  it("is deterministic and does not call the network", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const first = await runGate({ items, manifest, replay: replayCaptures(), git, thresholds: openThresholds(), baseline: null });
    const second = await runGate({ items, manifest, replay: replayCaptures(), git, thresholds: openThresholds(), baseline: null });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(JSON.stringify(first.artifact)).toBe(JSON.stringify(second.artifact));
    expect(first.artifact.route.mode).toBe("replay");
    expect(first.artifact.latency_ms).toEqual({ p50: null, p95: null });
    expect(first.artifact.cost.estimated_usd).toBeNull();
    expect(first.artifact.per_type.retention.recall).toBe(1);
    expect(first.artifact.per_type.retention.precision_ci95[0]).not.toBeNull();
    expect(first.failures.some((failure) => failure.code === "missing_replay")).toBe(false);
  });

  it("fails when a broken parser turns labeled positives into none", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("network"));
    const baseline = await runGate({
      items,
      manifest,
      replay: replayCaptures(),
      git,
      thresholds: openThresholds({ min_surfaced_evidence_validity: 0 }),
    });
    const broken = await runGate({
      items,
      manifest,
      replay: replayCaptures(),
      git,
      baseline: baseline.artifact,
      thresholds: openThresholds({ min_surfaced_evidence_validity: 0 }),
      classifyOverride: async () => ({ type: "none", confidence: 0.99, summary: "override", quotes: [] }),
    });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(broken.code).toBe(1);
    expect(broken.artifact.per_type.retention.recall).toBe(0);
    expect(broken.failures.map((failure) => failure.code)).toContain("recall_drop");
  });

  it("fails closed when a selected item has no replay fixture", async () => {
    const partial = replayCaptures();
    partial.delete("keep");
    const result = await runGate({
      items,
      manifest,
      replay: partial,
      git,
      thresholds: openThresholds({ min_items_per_type: 0, min_surfaced_evidence_validity: 0 }),
      baseline: null,
    });
    expect(result.code).toBe(1);
    expect(result.failures.map((failure) => failure.code)).toContain("missing_replay");
  });

  it("rejects replay captured under a different prompt identity", async () => {
    const result = await runGate({
      items,
      manifest,
      replay: replayCaptures("superseded-prompt"),
      git,
      thresholds: openThresholds({ min_surfaced_evidence_validity: 0 }),
      baseline: null,
    });
    expect(result.failures).toContainEqual({
      code: "replay_provenance",
      detail: "4 replay fixtures do not match route, prompt, or corpus",
    });
  });

  it("rejects stale, wrong-owner, missing-message, and invalid-code-point evidence anchors", () => {
    const messages = [
      { id: "m1", conversationId: "keep", role: "customer" as const, content: "I am closing 😀", timestamp: "t" },
      { id: "m2", conversationId: "keep", role: "customer" as const, content: "Move my funds", timestamp: "t" },
    ];
    expect(resolveEvidenceAnchor("I am closing 😀 Move my funds", messages, "tenant_gold", "keep")).toBeNull();
    const anchor: EvalEvidenceAnchor = {
      tenantId: "tenant_gold",
      conversationId: "keep",
      messageId: "m1",
      start: 0,
      end: 14,
      textSha256: "replace-with-real-hash",
    };
    expect(validateEvidenceAnchor({ ...anchor, messageId: "missing" }, messages, "tenant_gold", "keep")).toBe(false);
    expect(validateEvidenceAnchor({ ...anchor, tenantId: "other" }, messages, "tenant_gold", "keep")).toBe(false);
    expect(validateEvidenceAnchor({ ...anchor, textSha256: "0".repeat(64) }, messages, "tenant_gold", "keep")).toBe(false);
    expect(validateEvidenceAnchor({ ...anchor, start: 13, end: 99 }, messages, "tenant_gold", "keep")).toBe(false);
  });

  it("treats a capped route as screened out instead of a missing fixture", async () => {
    const result = await runGate({
      items,
      manifest,
      replay,
      git,
      maxCalls: 0,
      thresholds: openThresholds({ min_items_per_type: 0, min_surfaced_evidence_validity: 0 }),
      baseline: null,
    });
    expect(result.artifact.coverage.screened_out).toBe(items.length);
    expect(result.failures.map((failure) => failure.code)).not.toContain("missing_replay");
  });

  it("passes the real validation gate on the frozen v3 replay", async () => {
    const result = await runGate({ git: { sha: "test", dirty: false } });
    expect(result.code).toBe(0);
    expect(result.failures).toEqual([]);
    expect(result.artifact.injection_critical_failures).toBe(0);
    expect(result.artifact.coverage.completed).toBe(120);
    expect(result.artifact.route.prompt_version).toBe("final-intent-recent-complete-turns-v3");
  });

  it("runs in CI with no provider key and no record step", () => {
    const yml = readFileSync(join(import.meta.dirname, "../../../.github/workflows/test.yml"), "utf8");
    const job = yml.split("\n  eval-gate:")[1]?.split("\n  gitleaks:")[0] ?? "";
    expect(job).toContain("npm run eval:gate");
    expect(job).toContain('node-version: "22"');
    expect(job).not.toContain("GROQ");
    expect(job).not.toContain("secrets.");
    expect(job).not.toContain("eval:gate:record");
    expect(job).toContain("actions/upload-artifact");
    expect(job).toContain("if: always()");
    expect(job).toContain("web/eval/gate/artifact.json");
  });

  it("emits and saves the full artifact even when the CLI gate fails", () => {
    const dir = mkdtempSync(join(tmpdir(), "sioona-gate-cli-"));
    const artifactPath = join(dir, "artifact.json");
    try {
      const result = spawnSync(process.execPath, ["--import", "tsx", "eval/gate/run-gate.ts"], {
        cwd: join(import.meta.dirname, "../.."),
        encoding: "utf8",
        env: { ...process.env, EVAL_GATE_ARTIFACT_PATH: artifactPath },
      });
      expect(result.status).toBe(1);
      const output = JSON.parse(result.stdout.trim()) as { artifact: unknown };
      expect(output.artifact).toEqual(JSON.parse(readFileSync(artifactPath, "utf8")));
      expect(output.artifact).toMatchObject({
        artifact_version: 1,
        per_type: { retention: { precision_ci95: expect.any(Array) } },
        route: { prompt_version: expect.any(String) },
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("eval:gate:record", () => {
  it("refuses to call the provider unless the flag, cap, and synthetic path are set", async () => {
    const fetchSpy = vi.fn();
    const disabled = await recordReplay({ enabled: false, maxCalls: 1, fetchImpl: fetchSpy });
    expect(disabled.code).toBe(1);
    expect(disabled.calls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();

    const uncapped = await recordReplay({ enabled: true, fetchImpl: fetchSpy });
    expect(uncapped.failures.map((failure) => failure.code)).toContain("record_cap_missing");
    expect(uncapped.calls).toBe(0);

    const holdout = await recordReplay({
      enabled: true,
      maxCalls: 1,
      goldDirectory: "/tmp/partner-holdout",
      fetchImpl: fetchSpy,
    });
    expect(holdout.failures.map((failure) => failure.code)).toContain("record_refused");
    expect(holdout.calls).toBe(0);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("records only the requested ids and treats that subset as complete", async () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
    vi.stubEnv("DETECT_LLM_PRIMARY", "1");
    resetGroqPaceForTests();
    const content = JSON.stringify({
      signal: "none",
      confidence: 0.4,
      evidence: "",
      reason: "statement",
    });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200, headers: { "x-request-id": "req_subset" } }
      )
    );
    const replayDir = mkdtempSync(join(tmpdir(), "sioona-gate-subset-"));
    try {
      const missing = await recordReplay({
        enabled: true,
        maxCalls: 1,
        split: "dev",
        itemIds: ["missing-gold-id"],
        replayDir,
        fetchImpl,
        ledger: {
          sink: () => undefined,
          preflight: async () => true,
          flush: async () => ({ flushed: 0, failed: false }),
        },
      });
      expect(missing.calls).toBe(0);
      expect(missing.failures.map((failure) => failure.code)).toContain("record_refused");

      const result = await recordReplay({
        enabled: true,
        maxCalls: 1,
        split: "dev",
        itemIds: ["dev-none-08"],
        replayDir,
        fetchImpl,
        ledger: {
          sink: () => undefined,
          preflight: async () => true,
          flush: async () => ({ flushed: 1, failed: false }),
        },
      });
      expect(result.calls).toBe(1);
      expect(result.wrote).toHaveLength(1);
      expect(result.code).toBe(0);
      expect(result.failures).toEqual([]);
      const saved = JSON.parse(readFileSync(result.wrote[0], "utf8")) as { item_id: string };
      expect(saved.item_id).toBe("dev-none-08");
    } finally {
      rmSync(replayDir, { recursive: true, force: true });
    }
  });

  it("stops at the call cap and stores model JSON without the prompt", async () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
    vi.stubEnv("DETECT_LLM_PRIMARY", "1");
    resetGroqPaceForTests();
    expect(process.env.DETECT_LLM).toBe("1");
    expect(Boolean(process.env.GROQ_API_KEY?.trim())).toBe(true);
    const content = JSON.stringify({
      signal: "none",
      confidence: 0.4,
      evidence: "",
      reason: "statement",
    });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({
          id: "req_test",
          choices: [{ message: { content } }],
          usage: { prompt_tokens: 12, completion_tokens: 4 },
        }),
        { status: 200, headers: { "x-request-id": "req_test" } }
      )
    );
    const replayDir = mkdtempSync(join(tmpdir(), "sioona-gate-"));
    try {
      const result = await recordReplay({
        enabled: true,
        maxCalls: 1,
        split: "dev",
        replayDir,
        fetchImpl,
        ledger: {
          sink: () => undefined,
          preflight: async () => true,
          flush: async () => ({ flushed: 1, failed: false }),
        },
      });
      expect(result.calls).toBe(1);
      expect(result.wrote).toHaveLength(1);
      expect(result.code).toBe(1);
      expect(result.failures.map((failure) => failure.code)).toContain("record_incomplete");
      const saved = JSON.parse(readFileSync(result.wrote[0], "utf8")) as {
        item_id: string;
        content: string;
      };
      expect(saved.item_id).toBe("dev-none-08");
      expect(saved.content).toBe(content);
      expect(saved.content).not.toContain("Classify one Indian finance");
      expect(saved.content).not.toContain("Return ONE JSON object");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    } finally {
      rmSync(replayDir, { recursive: true, force: true });
    }
  });

  it("keeps injection replies on their own items when the prompt repeats an earlier chat", async () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
    vi.stubEnv("DETECT_LLM_PRIMARY", "1");
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "1");
    resetGroqPaceForTests();
    const content = JSON.stringify({
      signal: "none",
      confidence: 0.4,
      evidence: "",
      reason: "statement",
    });
    const fetchImpl = vi.fn(async () =>
      new Response(
        JSON.stringify({ choices: [{ message: { content } }] }),
        { status: 200, headers: { "x-request-id": "req_attr" } }
      )
    );
    const attempts: InferenceAttempt[] = [];
    const replayDir = mkdtempSync(join(tmpdir(), "sioona-gate-attr-"));
    try {
      const result = await recordReplay({
        enabled: true,
        maxCalls: 120,
        split: "validation",
        replayDir,
        fetchImpl,
        ledger: {
          sink: (attempt) => attempts.push(attempt),
          preflight: async () => true,
          flush: async () => ({ flushed: attempts.length, failed: false }),
        },
      });
      expect(result.calls).toBe(120);
      expect(result.wrote).toHaveLength(120);
      expect(result.code).toBe(0);
      for (const id of [
        "val-retention-15",
        "val-retention-16",
        "val-upsell-15",
        "val-upsell-16",
        "val-lead-15",
        "val-lead-16",
        "val-none-15",
        "val-none-16",
      ]) {
        const saved = JSON.parse(readFileSync(join(replayDir, `${id}.json`), "utf8")) as {
          item_id: string;
          content: string;
        };
        expect(saved.item_id).toBe(id);
        expect(saved.content).toBe(content);
      }
    } finally {
      rmSync(replayDir, { recursive: true, force: true });
    }
  });

  it("persists every retry once and keeps missing usage unknown", async () => {
    vi.stubEnv("DETECT_LLM", "1");
    vi.stubEnv("GROQ_API_KEY", "gsk_test");
    vi.stubEnv("DETECT_LLM_MIN_INTERVAL_MS", "0");
    vi.stubEnv("DETECT_LLM_PRIMARY", "1");
    vi.stubEnv("DETECT_LLM_MAX_ATTEMPTS", "2");
    resetGroqPaceForTests();
    const attempts: InferenceAttempt[] = [];
    const ledger = {
      sink: (attempt: InferenceAttempt) => attempts.push(attempt),
      preflight: vi.fn(async () => true),
      flush: vi.fn(async () => ({ flushed: attempts.length, failed: false })),
    };
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response("provider failed", { status: 500 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        id: "req_success",
        choices: [{ message: { content: JSON.stringify({ signal: "none", confidence: 0.4, evidence: "", reason: "ops" }) } }],
      }), { status: 200, headers: { "x-request-id": "req_success" } }));
    const replayDir = mkdtempSync(join(tmpdir(), "sioona-gate-ledger-"));
    try {
      const result = await recordReplay({ enabled: true, maxCalls: 2, split: "dev", replayDir, fetchImpl, ledger });
      expect(ledger.preflight).toHaveBeenCalledTimes(1);
      expect(ledger.flush).toHaveBeenCalledTimes(1);
      expect(attempts.length).toBeGreaterThanOrEqual(2);
      expect(new Set(attempts.map((attempt) => attempt.attemptId)).size).toBe(attempts.length);
      expect(attempts.map((attempt) => attempt.status)).toContain("failed");
      expect(attempts.map((attempt) => attempt.status)).toContain("succeeded");
      expect(result.cost).toEqual({
        attempts: attempts.length,
        unknown_cost_attempts: attempts.length,
        estimated_usd: null,
        unknown_cost_fraction: 1,
      });
    } finally {
      rmSync(replayDir, { recursive: true, force: true });
    }
  });
});
