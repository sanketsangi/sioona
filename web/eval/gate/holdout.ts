/** External-only evaluation. No partner bytes, quotes or per-item outputs are emitted. */
import { createHash } from "node:crypto";
import { readFileSync, realpathSync, writeFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseIngestDocument } from "../../src/lib/ingest";
import { classifyConversationWithGroq, createGroqModelSession } from "../../src/lib/detect-llm";
import { createRunLedger } from "../../src/lib/ai/ledger";
import { runWithServicePrincipal } from "../../src/lib/backend-client";
import { loadManifest, type GoldManifest, type GoldItem } from "../gold/load";
import { compareToBaseline, loadThresholds, type GateArtifact, type GateFailure, type Thresholds } from "./compare";
import { readGitState, runGate } from "./run-gate";
import { candidateIdentity, type CandidateIdentity } from "./identity";

const root = resolve(fileURLToPath(new URL("../../..", import.meta.url)));
export type HoldoutResult = { version: 1; identity: CandidateIdentity; artifact: GateArtifact };
function outside(path: string): string {
  if (!isAbsolute(path)) throw new Error("external_path_required");
  const rel = relative(realpathSync(root), resolve(path));
  if (!rel || (!rel.startsWith("../") && rel !== "..")) throw new Error("external_path_required");
  return path;
}
export function verifyExternalCorpus(path: string, manifest: GoldManifest): GoldItem[] {
  outside(path);
  let body: Buffer;
  try { outside(realpathSync(path)); body = readFileSync(path); } catch (error) {
    if (error instanceof Error && error.message === "external_path_required") throw error;
    throw new Error("holdout_unavailable");
  }
  if (createHash("sha256").update(body).digest("hex") !== manifest.holdout.sha256) throw new Error("holdout_checksum");
  // Check raw export cardinality before the shared parser trims or drops rows.
  let raw: unknown;
  try { raw = JSON.parse(body.toString("utf8")); } catch { throw new Error("holdout_shape"); }
  const rows = Array.isArray(raw) ? raw : raw && typeof raw === "object" && "conversations" in raw ? raw.conversations : null;
  if (!Array.isArray(rows)) throw new Error("holdout_shape");
  if (rows.length !== manifest.holdout.n) throw new Error("holdout_count");
  let chats: ReturnType<typeof parseIngestDocument>["conversations"];
  try { chats = parseIngestDocument("holdout.json", body.toString("utf8")).conversations; }
  catch { throw new Error("holdout_shape"); }
  if (chats.length !== manifest.holdout.n) throw new Error("holdout_count");
  return chats.map((chat, index) => {
    if (!chat.groundTruth || !["retention", "upsell", "lead", "none"].includes(chat.groundTruth)) throw new Error("holdout_labels");
    return { id: `holdout_${index}`, split: "validation", label: chat.groundTruth, language: "en", tags: [],
      tenantId: "tenant_eval", customerName: "Customer", channel: chat.channel ?? "upload",
      messages: chat.messages.map(message => ({ role: message.role, content: message.content })) } as GoldItem;
  });
}
function validResult(result: HoldoutResult, manifest: GoldManifest): boolean {
  try {
    const a = result.artifact;
    const count = (n: number) => Number.isSafeInteger(n) && n >= 0;
    const rate = (n: number | null) => n === null || (Number.isFinite(n) && n >= 0 && n <= 1);
    const buckets = ["retention", "upsell", "lead", "none"] as const;
    const metricsValid = buckets.every(type => {
      const r = a.per_type[type];
      return r && [r.tp, r.fp, r.fn, r.n_precision, r.n_recall].every(count) &&
        r.n_precision === r.tp + r.fp && r.n_recall === r.tp + r.fn &&
        r.precision === (r.n_precision ? r.tp / r.n_precision : null) &&
        r.recall === (r.n_recall ? r.tp / r.n_recall : null) && rate(r.f1) &&
        [r.precision_ci95, r.recall_ci95].every(interval => Array.isArray(interval) && interval.length === 2 && interval.every(rate));
    });
    const e = a.evidence_validity;
    return result.version === 1 && a.artifact_version === 1 && metricsValid && a.route.mode === "live" && !a.git_dirty &&
      /^[a-f0-9]{40}$/.test(result.identity.source_sha) && result.identity.source_sha === a.git_sha &&
      /^[a-f0-9]{64}$/.test(result.identity.prompt_sha256) && /^[a-f0-9]{64}$/.test(result.identity.config_sha256) && /^[a-f0-9]{64}$/.test(result.identity.request_config_sha256) &&
      a.corpus.split === "holdout" && a.corpus.manifest_sha256 === manifest.holdout.sha256 &&
      a.corpus.n === manifest.holdout.n && buckets.reduce((sum, type) => sum + a.per_type[type].n_recall, 0) === a.corpus.n && a.coverage.eligible === a.corpus.n &&
      a.coverage.completed === a.corpus.n && a.coverage.failed === 0 && a.coverage.screened_out === 0 &&
      a.coverage.rate === 1 && count(a.cost.attempts) && a.cost.attempts >= a.corpus.n && count(a.cost.unknown_cost_attempts) && a.cost.unknown_cost_attempts <= a.cost.attempts &&
      a.cost.unknown_cost_fraction === (a.cost.attempts ? a.cost.unknown_cost_attempts / a.cost.attempts : null) &&
      count(e.valid) && count(e.surfaced) && e.valid <= e.surfaced && e.rate === (e.surfaced ? e.valid / e.surfaced : null) &&
      count(a.injection_critical_failures) && count(a.tenant_failures);
  } catch { return false; }
}
export function comparePromotion(synthetic: GateArtifact, baseline: HoldoutResult | null, candidate: HoldoutResult | null,
  manifest: GoldManifest, thresholds: Thresholds, expected = candidateIdentity()): GateFailure[] {
  if (!baseline || !candidate) return [{ code: "holdout_unverified", detail: "verified baseline and candidate holdout results required" }];
  if (!validResult(baseline, manifest) || !validResult(candidate, manifest)) return [{ code: "holdout_invalid", detail: "incomplete or mismatched external evaluation" }];
  if (Object.keys(expected).some(key => candidate.identity[key as keyof CandidateIdentity] !== expected[key as keyof CandidateIdentity]) || candidate.artifact.git_sha !== expected.source_sha ||
      synthetic.git_sha !== expected.source_sha || synthetic.git_dirty) return [{ code: "candidate_mismatch", detail: "candidate identity differs from the current checkout" }];
  try {
    return compareToBaseline({ current: candidate.artifact, baseline: baseline.artifact, thresholds, holdout: manifest.holdout }).failures;
  } catch { return [{ code: "holdout_invalid", detail: "malformed aggregate metrics" }]; }
}
async function main() {
  const promotion = process.argv.includes("--promotion");
  const manifest = loadManifest();
  if (promotion) {
    const synthetic = await runGate();
    const load = (path: string | undefined): HoldoutResult | null => {
      if (!path) return null;
      try { outside(realpathSync(path)); return JSON.parse(readFileSync(path, "utf8")) as HoldoutResult; } catch { return null; }
    };
    const failures = [...synthetic.failures, ...comparePromotion(synthetic.artifact, load(process.env.EVAL_HOLDOUT_BASELINE), load(process.env.EVAL_HOLDOUT_CANDIDATE), manifest, loadThresholds())];
    console.log(JSON.stringify({ code: failures.length ? 1 : 0, failures }));
    process.exitCode = failures.length ? 1 : 0;
    return;
  }
  if (process.env.EVAL_HOLDOUT_AUTHORIZED !== "1") throw new Error("holdout_not_authorized");
  const cap = Number(process.env.EVAL_HOLDOUT_MAX_ATTEMPTS);
  if (!Number.isSafeInteger(cap) || cap < 1) throw new Error("holdout_cap_required");
  const git = readGitState();
  if (git.dirty) throw new Error("git_dirty");
  const path = process.env.EVAL_HOLDOUT_PATH ?? "";
  const output = process.env.EVAL_HOLDOUT_OUTPUT ?? "";
  outside(output); outside(realpathSync(resolve(output, "..")));
  try { outside(realpathSync(output)); throw new Error("holdout_output_exists"); } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && error.code === "ENOENT")) throw error;
  }
  const items = verifyExternalCorpus(path, manifest);
  const externalManifest = { ...manifest, id: `${manifest.id}:holdout`, splits: { ...manifest.splits,
    validation: { path: "external", sha256: manifest.holdout.sha256!, n: items.length } } };
  const { createAttemptGuard } = await import("../../src/lib/ai/budget");
  const ledger = createRunLedger("tenant_eval");
  const session = createGroqModelSession();
  const attempts: import("../../src/lib/ai/types").InferenceAttempt[] = [];
  await runWithServicePrincipal("principal:eval", "tenant_eval", async () => {
    if (!(await ledger.preflight())) throw new Error("ledger_unavailable");
    const guard = createAttemptGuard("tenant_eval", cap);
    let result: Awaited<ReturnType<typeof runGate>>;
    try {
      result = await runGate({ items, manifest: externalManifest, git, baseline: null,
        classifyOverride: input => classifyConversationWithGroq(input, session, { tenantId: "tenant_eval", attemptSink: attempt => { attempts.push(attempt); ledger.sink(attempt); }, attemptGuard: guard }) });
    } finally {
      const flushed = await ledger.flush();
      if (flushed.failed || flushed.flushed !== attempts.length) throw new Error("ledger_flush");
    }
    result.artifact.corpus.split = "holdout";
    result.artifact.route.mode = "live";
    result.artifact.cost = guard.metrics();
    const latencies = attempts.map(attempt => attempt.latencyMs).sort((a, b) => a - b);
    const percentile = (p: number) => latencies.length ? latencies[Math.ceil(p * latencies.length) - 1] : null;
    result.artifact.latency_ms = { p50: percentile(0.5), p95: percentile(0.95) };
    if (result.artifact.coverage.completed !== items.length || result.artifact.coverage.failed > 0) throw new Error("holdout_incomplete");
    const aggregate: HoldoutResult = { version: 1, identity: candidateIdentity(), artifact: result.artifact };
    writeFileSync(output, JSON.stringify(aggregate, null, 2) + "\n", { mode: 0o600, flag: "wx" });
    console.log(JSON.stringify({ code: 0, n: items.length }));
  });
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch(() => {
  console.error("external_evaluation_failed"); process.exitCode = 1;
});
