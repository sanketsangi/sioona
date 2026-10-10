import { runWithServicePrincipal } from "../../src/lib/backend-client";
import { candidateIdentity, verifyCaptureIdentity, type CandidateIdentity } from "./identity";
import { createAttemptGuard } from "../../src/lib/ai/budget";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, renameSync, rmSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createRunLedger, type RunLedger } from "../../src/lib/ai/ledger";
import type { AttemptSink, InferenceAttempt } from "../../src/lib/ai/types";
import {
  DETECT_PROMPT_VERSION,
  DEFAULT_DETECT_LLM_MODEL,
  FALLBACK_DETECT_LLM_MODEL,
  detectRouteVersion,
  parseLlmClassificationJson,
  runHybridDetection,
  type LlmClassifyFn,
} from "../../src/lib/detect-llm";
import { redactText } from "../../src/lib/redact";
import type { Conversation, Message, Signal, SignalType } from "../../src/lib/types";
import {
  goldDir,
  loadManifest,
  loadSplit,
  type GoldItem,
  type GoldManifest,
  type GoldSplitName,
} from "../gold/load";
import {
  compareToBaseline,
  gateExitCode,
  loadArtifactSchema,
  loadThresholds,
  missingSchemaKeys,
  routeSlug,
  scoreCorpus,
  type GateArtifact,
  type GateFailure,
  type ScoredRow,
  type Thresholds,
} from "./compare";

const gateDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(gateDir, "../../..");
const FROZEN_AT = "2026-01-01T00:00:00.000Z";

export type GitState = { sha: string; dirty: boolean };

export type ReplayCapture = {
  item_id: string;
  content: string;
  route_version: string;
  prompt_version: string;
  corpus_sha256: string;
  identity?: CandidateIdentity;
  capture_sha256?: string;
};

export type EvalEvidenceAnchor = {
  tenantId: string;
  conversationId: string;
  messageId: string;
  start: number;
  end: number;
  textSha256: string;
};

export function readGitState(cwd = repoRoot): GitState {
  try {
    const sha = execFileSync("git", ["rev-parse", "HEAD"], { cwd, encoding: "utf8" }).trim();
    const porcelain = execFileSync("git", ["status", "--porcelain"], { cwd, encoding: "utf8" });
    return { sha, dirty: porcelain.length > 0 };
  } catch {
    return { sha: "unknown", dirty: true };
  }
}

export function defaultReplayDir(routeVersion = detectRouteVersion()): string {
  return join(gateDir, "replay", routeSlug(routeVersion));
}

export function loadReplayDir(dir: string): Map<string, ReplayCapture> {
  const fixtures = new Map<string, ReplayCapture>();
  if (!existsSync(dir)) return fixtures;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith(".json")) continue;
    const parsed = JSON.parse(readFileSync(join(dir, name), "utf8")) as Partial<ReplayCapture>;
    if (typeof parsed.item_id === "string" && typeof parsed.content === "string") {
      fixtures.set(parsed.item_id, {
        item_id: parsed.item_id,
        content: parsed.content,
        route_version: typeof parsed.route_version === "string" ? parsed.route_version : "",
        prompt_version: typeof parsed.prompt_version === "string" ? parsed.prompt_version : "",
        corpus_sha256: typeof parsed.corpus_sha256 === "string" ? parsed.corpus_sha256 : "",
        identity: parsed.identity,
        capture_sha256: createHash("sha256").update(readFileSync(join(dir, name))).digest("hex"),
      });
    }
  }
  return fixtures;
}

function loadBaseline(path: string): GateArtifact | null {
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as GateArtifact;
}

function detectionBundle(items: GoldItem[]): { conversations: Conversation[]; messages: Message[] } {
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  for (const item of items) {
    const itemMessages = item.messages.map((message, index): Message => ({
      id: `msg_${item.id}_${index}`,
      conversationId: item.id,
      role: message.role,
      content: redactText(message.content),
      timestamp: FROZEN_AT,
    }));
    conversations.push({
      id: item.id,
      tenantId: item.tenantId,
      channel: item.channel,
      customerName: item.customerName,
      startedAt: FROZEN_AT,
      messageIds: itemMessages.map((message) => message.id),
      groundTruth: item.label,
    });
    messages.push(...itemMessages);
  }
  return { conversations, messages };
}

function evidenceQuotes(evidence: string[]): string[] {
  const quotes: string[] = [];
  for (const item of evidence) {
    const match = /^quote: "(.*)"$/.exec(item);
    if (match?.[1]) quotes.push(match[1]);
  }
  return quotes;
}

function textSha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Canonical D3 normalization matches Python str.isspace(), including NEL and
// excluding BOM. JS \s differs on both; keep this set covered by shared fixtures.
const evidenceWhitespace = /[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]/u;
const evidenceWhitespaceRun = /[\u0009-\u000d\u001c-\u0020\u0085\u00a0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/u;
const normalizeEvidenceWhitespace = (value: string) => value.split(evidenceWhitespaceRun).filter(Boolean).join(" ");
function collapsedCodePoints(text: string): { text: string; indexes: number[] } {
  const points = Array.from(text);
  const output: string[] = [];
  const indexes: number[] = [];
  let gapAt: number | null = null;
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (evidenceWhitespace.test(point)) {
      if (output.length > 0 && gapAt === null) gapAt = index;
      continue;
    }
    if (gapAt !== null) {
      output.push(" ");
      indexes.push(gapAt);
      gapAt = null;
    }
    output.push(point);
    indexes.push(index);
  }
  return { text: output.join(""), indexes };
}

export function resolveEvidenceAnchor(
  quote: string,
  messages: Message[],
  tenantId: string,
  conversationId: string
): EvalEvidenceAnchor | null {
  const needle = normalizeEvidenceWhitespace(quote);
  if (!needle) return null;
  let match: EvalEvidenceAnchor | null = null;
  for (const message of messages) {
    if (message.role !== "customer" || message.conversationId !== conversationId) continue;
    const collapsed = collapsedCodePoints(message.content);
    const utf16At = collapsed.text.indexOf(needle);
    if (utf16At < 0) continue;
    const at = Array.from(collapsed.text.slice(0, utf16At)).length;
    const length = Array.from(needle).length;
    const start = collapsed.indexes[at];
    const endPoint = collapsed.indexes[at + length - 1];
    if (start === undefined || endPoint === undefined) continue;
    match = {
      tenantId,
      conversationId,
      messageId: message.id,
      start,
      end: endPoint + 1,
      textSha256: textSha256(message.content),
    };
  }
  return match;
}

export function validateEvidenceAnchor(
  anchor: EvalEvidenceAnchor,
  messages: Message[],
  tenantId: string,
  conversationId: string,
  expectedQuote?: string
): boolean {
  if (anchor.tenantId !== tenantId || anchor.conversationId !== conversationId) return false;
  const message = messages.find(
    (row) => row.id === anchor.messageId && row.conversationId === conversationId && row.role === "customer"
  );
  if (!message || textSha256(message.content) !== anchor.textSha256) return false;
  if (!Number.isInteger(anchor.start) || !Number.isInteger(anchor.end)) return false;
  const points = Array.from(message.content);
  if (!(0 <= anchor.start && anchor.start < anchor.end && anchor.end <= points.length)) return false;
  const reconstructed = points.slice(anchor.start, anchor.end).join("");
  return reconstructed.length > 0 && (expectedQuote === undefined ||
    normalizeEvidenceWhitespace(reconstructed) === normalizeEvidenceWhitespace(expectedQuote));
}

export async function runGate(options: {
  split?: GoldSplitName;
  items?: GoldItem[];
  manifest?: GoldManifest;
  replay?: Map<string, ReplayCapture>;
  replayDir?: string;
  baseline?: GateArtifact | null;
  baselinePath?: string;
  thresholds?: Thresholds;
  git?: GitState;
  maxCalls?: number;
  classifyOverride?: LlmClassifyFn;
} = {}): Promise<{ code: number; artifact: GateArtifact; failures: GateFailure[] }> {
  const manifest = options.manifest ?? loadManifest();
  const split = options.split ?? "validation";
  const items = options.items ?? loadSplit(split);
  const fixtures = options.replay ?? loadReplayDir(options.replayDir ?? defaultReplayDir());
  const thresholds = options.thresholds ?? loadThresholds();
  const git = options.git ?? readGitState();
  const baseline =
    options.baseline !== undefined
      ? options.baseline
      : loadBaseline(options.baselinePath ?? join(gateDir, "baseline.json"));

  const routeVersion = detectRouteVersion();
  const promptVersion = DETECT_PROMPT_VERSION;
  const corpusSha256 = manifest.splits[split].sha256;
  const outcomes = new Map<string, "none" | "signal" | "unparsed" | "missing" | "provenance">();
  const classify: LlmClassifyFn =
    options.classifyOverride ? async input => {
      try {
        const parsed = await options.classifyOverride!(input);
        outcomes.set(input.conversation.id, !parsed ? "unparsed" : parsed.type === "none" ? "none" : "signal");
        return parsed;
      } catch (error) { outcomes.set(input.conversation.id, "unparsed"); throw error; }
    } : (async (input) => {
      const fixture = fixtures.get(input.conversation.id);
      if (fixture === undefined) {
        outcomes.set(input.conversation.id, "missing");
        return null;
      }
      if (
        fixture.route_version !== routeVersion ||
        fixture.prompt_version !== promptVersion ||
        fixture.corpus_sha256 !== corpusSha256 ||
        (!options.replay && !verifyCaptureIdentity(fixture))
      ) {
        outcomes.set(input.conversation.id, "provenance");
        return null;
      }
      const parsed = parseLlmClassificationJson(fixture.content);
      if (!parsed) {
        outcomes.set(input.conversation.id, "unparsed");
        return null;
      }
      outcomes.set(input.conversation.id, parsed.type === "none" ? "none" : "signal");
      return parsed;
    });

  const { conversations, messages } = detectionBundle(items);
  const detected = await runHybridDetection(conversations, messages, items[0]?.tenantId ?? "tenant_gold", null, {
    classify,
    concurrency: 1,
    ...(options.maxCalls !== undefined ? { maxCalls: options.maxCalls } : {}),
  });
  const skipped = new Set(detected.llm.skippedIds ?? []);
  const rejected = new Set(detected.llm.failedIds ?? []);
  const signalsByConversation = new Map<string, Signal[]>();
  for (const signal of detected.signals) {
    const list = signalsByConversation.get(signal.conversationId) ?? [];
    list.push(signal);
    signalsByConversation.set(signal.conversationId, list);
  }

  const missingIds: string[] = [];
  const provenanceIds: string[] = [];
  const rows: ScoredRow[] = items.map((item) => {
    const signals = signalsByConversation.get(item.id) ?? [];
    const screenedOut = skipped.has(item.id);
    const outcome = outcomes.get(item.id);
    const itemMessages = messages.filter((message) => message.conversationId === item.id);
    const quotes = signals.flatMap((signal) => evidenceQuotes(signal.evidence));
    const quoteRows = quotes.map((text) => ({
      text,
      valid: (() => {
        const anchor = resolveEvidenceAnchor(text, itemMessages, item.tenantId, item.id);
        return anchor !== null && validateEvidenceAnchor(anchor, itemMessages, item.tenantId, item.id, text);
      })(),
    }));
    const tenantFailure = signals.some(
      (signal) =>
        signal.tenantId !== item.tenantId ||
        signal.conversationId !== item.id ||
        evidenceQuotes(signal.evidence).some((quote) => {
          const anchor = resolveEvidenceAnchor(quote, itemMessages, item.tenantId, item.id);
          return anchor === null || !validateEvidenceAnchor(anchor, itemMessages, item.tenantId, item.id, quote);
        })
    );
    if (!options.classifyOverride && !screenedOut && outcome === "missing") missingIds.push(item.id);
    if (!options.classifyOverride && !screenedOut && outcome === "provenance") provenanceIds.push(item.id);
    const surfaced = signals
      .map((signal) => signal.type)
      .filter((type): type is SignalType => type === "retention" || type === "upsell" || type === "lead");
    return {
      id: item.id,
      gold: item.label,
      surfaced,
      explicitNone: outcome === "none" && !screenedOut,
      screenedOut,
      completed: screenedOut || (!rejected.has(item.id) && (outcome === "none" || outcome === "signal")),
      failed: rejected.has(item.id) || outcome === "unparsed" || outcome === "missing" || outcome === "provenance",
      quotes: quoteRows,
      injectionAttack: item.injection?.attackLabel ?? null,
      tenantFailure,
    };
  });

  const artifact = scoreCorpus(rows, {
    git_sha: git.sha,
    git_dirty: git.dirty,
    corpus: {
      id: manifest.id,
      split,
      manifest_sha256: corpusSha256,
      n: items.length,
    },
    route: {
      route_version: routeVersion,
      models: [DEFAULT_DETECT_LLM_MODEL, FALLBACK_DETECT_LLM_MODEL],
      prompt_version: promptVersion,
      mode: "replay",
    },
  });

  artifact.identity = { ...candidateIdentity(), source_sha: git.sha };
  const compared = compareToBaseline({
    current: artifact,
    baseline,
    thresholds,
    holdout: manifest.holdout,
    syntheticOnly: true,
  });
  const failures = [...compared.failures];
  const shape = missingSchemaKeys(artifact, loadArtifactSchema());
  if (shape.length > 0) {
    failures.push({ code: "artifact_shape", detail: shape.join(", ") });
  }
  if (missingIds.length > 0) {
    failures.push({
      code: "missing_replay",
      detail: `${missingIds.length} selected items have no replay fixture`,
    });
  }
  if (provenanceIds.length > 0) {
    failures.push({
      code: "replay_provenance",
      detail: `${provenanceIds.length} replay fixtures do not match route, prompt, or corpus`,
    });
  }
  return { code: gateExitCode(failures.length === 0), artifact, failures };
}

function syntheticDir(dir: string, split: GoldSplitName): void {
  if (split !== "dev" && split !== "validation") {
    throw new Error("record refuses holdout and partner paths");
  }
  if (resolve(dir) !== resolve(goldDir)) {
    throw new Error("record refuses paths outside the synthetic gold corpus");
  }
}

export async function recordReplay(options: {
  enabled: boolean;
  maxCalls?: number;
  /** When set, classify only these gold ids. Missing ids refuse the run. */
  itemIds?: readonly string[];
  split?: GoldSplitName;
  goldDirectory?: string;
  replayDir?: string;
  fetchImpl?: typeof fetch;
  ledger?: Pick<RunLedger, "sink" | "preflight" | "flush">;
}): Promise<{
  code: number;
  failures: GateFailure[];
  wrote: string[];
  calls: number;
  latency_ms: GateArtifact["latency_ms"];
  cost: GateArtifact["cost"];
}> {
  const emptyMetrics = {
    latency_ms: { p50: null, p95: null },
    cost: { attempts: 0, unknown_cost_attempts: 0, estimated_usd: null, unknown_cost_fraction: null },
  };
  if (!options.enabled) {
    return { code: 1, failures: [{ code: "record_disabled", detail: "EVAL_GATE_RECORD=1 is required" }], wrote: [], calls: 0, ...emptyMetrics };
  }
  if (!options.maxCalls || !Number.isInteger(options.maxCalls) || options.maxCalls < 1) {
    return {
      code: 1,
      failures: [{ code: "record_cap_missing", detail: "EVAL_GATE_RECORD_MAX_CALLS must be a positive integer" }],
      wrote: [],
      calls: 0,
      ...emptyMetrics,
    };
  }
  const split = options.split ?? "validation";
  const directory = options.goldDirectory ?? goldDir;
  try {
    syntheticDir(directory, split);
  } catch (err) {
    return {
      code: 1,
      failures: [{ code: "record_refused", detail: err instanceof Error ? err.message : "refused" }],
      wrote: [],
      calls: 0,
      ...emptyMetrics,
    };
  }

  const loaded = loadSplit(split, directory);
  const requested = options.itemIds?.map((id) => id.trim()).filter(Boolean);
  const wanted = requested ? [...new Set(requested)] : undefined;
  const items = wanted ? loaded.filter((item) => wanted.includes(item.id)) : loaded;
  if (wanted && (wanted.length === 0 || items.length !== wanted.length)) {
    return {
      code: 1,
      failures: [{
        code: "record_refused",
        detail: "EVAL_GATE_RECORD_IDS must be ids in this synthetic split",
      }],
      wrote: [],
      calls: 0,
      ...emptyMetrics,
    };
  }
  if (!(options.fetchImpl && options.ledger) && readGitState().dirty) {
    return { code: 1, failures: [{ code: "git_dirty", detail: "live captures require a clean source revision" }], wrote: [], calls: 0, ...emptyMetrics };
  }
  const manifest = loadManifest(directory);
  const ledger = options.ledger ?? createRunLedger(items[0]?.tenantId ?? "tenant_gold");
  if (!(await ledger.preflight())) {
    return {
      code: 1,
      failures: [{ code: "ledger_unavailable", detail: "inference ledger preflight failed" }],
      wrote: [],
      calls: 0,
      ...emptyMetrics,
    };
  }
  const { conversations, messages } = detectionBundle(items);
  const captured = new Map<string, string>();
  let calls = 0;
  const cap = options.maxCalls;
  const fetchImpl: typeof fetch = async (input, init) => {
    if (calls >= cap) throw new Error("record call cap exceeded");
    calls += 1;
    return (options.fetchImpl ?? fetch)(input, init);
  };

  const attempts: InferenceAttempt[] = [];
  const attemptSink: AttemptSink = (attempt) => {
    attempts.push(attempt);
    ledger.sink(attempt);
  };

  let runFailed = false;
  let flushed = { flushed: 0, failed: true };
  try {
    await runHybridDetection(conversations, messages, items[0]?.tenantId ?? "tenant_gold", null, {
      maxCalls: cap, concurrency: 1, attemptSink, providerFetch: fetchImpl,
      attemptGuard: options.fetchImpl && options.ledger ? undefined : createAttemptGuard(items[0]?.tenantId ?? "tenant_gold", cap),
      onProviderOutput: (itemId, content) => { if (content && parseLlmClassificationJson(content)) captured.set(itemId, content); },
    });
  } catch { runFailed = true; }
  finally { flushed = await ledger.flush(); }

  const replayDir = options.replayDir ?? defaultReplayDir();
  const wrote: string[] = [];
  const failures: GateFailure[] = [];
  if (runFailed || captured.size < items.length) {
    failures.push({
      code: "record_incomplete",
      detail: `recorded ${captured.size} of ${items.length} items in ${attempts.length} attempts`,
    });
  }
  if (flushed.failed || flushed.flushed !== attempts.length) {
    failures.push({ code: "ledger_flush", detail: `persisted ${flushed.flushed} of ${attempts.length} attempts` });
  }
  if (failures.length === 0) {
    mkdirSync(dirname(replayDir), { recursive: true });
    const staging = mkdtempSync(join(dirname(replayDir), ".record-"));
    try {
      const identity = candidateIdentity();
      for (const [itemId, content] of captured) {
        writeFileSync(join(staging, `${itemId}.json`), JSON.stringify({ item_id: itemId, content,
          route_version: detectRouteVersion(), prompt_version: DETECT_PROMPT_VERSION,
          corpus_sha256: manifest.splits[split].sha256, identity }) + "\n");
      }
      if (existsSync(replayDir) && readdirSync(replayDir).length > 0) throw new Error("capture_target_exists");
      if (existsSync(replayDir)) rmSync(replayDir, { recursive: true });
      renameSync(staging, replayDir);
      for (const id of captured.keys()) wrote.push(join(replayDir, `${id}.json`));
    } catch { failures.push({ code: "record_publish", detail: "capture target must be new and complete" }); }
    finally { if (existsSync(staging)) rmSync(staging, { recursive: true }); }
  }
  const latencies = attempts.map((attempt) => attempt.latencyMs).sort((a, b) => a - b);
  const percentile = (fraction: number): number | null =>
    latencies.length === 0 ? null : latencies[Math.ceil(fraction * latencies.length) - 1] ?? null;
  const unknown = attempts.length;
  return {
    code: gateExitCode(failures.length === 0),
    failures,
    wrote,
    calls,
    latency_ms: { p50: percentile(0.5), p95: percentile(0.95) },
    cost: {
      attempts: attempts.length,
      unknown_cost_attempts: unknown,
      estimated_usd: null,
      unknown_cost_fraction: attempts.length === 0 ? null : unknown / attempts.length,
    },
  };
}

async function main(): Promise<void> {
  if (process.argv.includes("--record")) {
    const cap = Number(process.env.EVAL_GATE_RECORD_MAX_CALLS);
    const itemIds = process.env.EVAL_GATE_RECORD_IDS?.split(",").map((id) => id.trim()).filter(Boolean);
    const result = await runWithServicePrincipal("principal:eval", "tenant_gold", () => recordReplay({
      enabled: process.env.EVAL_GATE_RECORD === "1",
      maxCalls: Number.isInteger(cap) && cap > 0 ? cap : undefined,
      ...(itemIds && itemIds.length > 0 ? { itemIds } : {}),
    }));
    console.log(JSON.stringify({ code: result.code, failures: result.failures, calls: result.calls, wrote: result.wrote.length }));
    process.exit(result.code);
  }
  const result = await runGate();
  const artifactPath = process.env.EVAL_GATE_ARTIFACT_PATH?.trim() || join(gateDir, "artifact.json");
  mkdirSync(dirname(artifactPath), { recursive: true });
  writeFileSync(artifactPath, `${JSON.stringify(result.artifact, null, 2)}\n`);
  console.log(JSON.stringify(result));
  process.exit(result.code);
}

const entry = process.argv[1] ? resolve(process.argv[1]) : "";
if (entry && fileURLToPath(import.meta.url) === entry) {
  main().catch((err: unknown) => {
    console.error(err instanceof Error ? err.name : "eval_gate_failed");
    process.exit(1);
  });
}
