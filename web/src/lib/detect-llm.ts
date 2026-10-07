/**
 * Detect: heuristics are a cheap pre-filter and a fallback.
 * When `DETECT_LLM=1` and `DETECT_LLM_PRIMARY` is not `0`, Groq classifies
 * every chat (batched, paced, retried). A grounded LLM label replaces the
 * heuristic hit. A failed or ungrounded call keeps the heuristic signal.
 */

import { recentCustomerTranscript, type TranscriptContext } from "./recent-transcript";
import { clipQuote } from "./clip-quote";
import { mapWithConcurrency } from "./concurrency";
import { pseudonymCustomerName, redactText } from "./redact";
import { attachSignalCommercial } from "./signal-commercial";
import {
  pickAction,
  runDetection,
  runDetectionWithProgress,
  SCORE_THRESHOLD,
} from "./detect";
import { resolveSuggestedAction } from "./suggested-action-display";
import type {
  Conversation,
  Message,
  Signal,
  SignalType,
  TaxonomyOverrides,
} from "./types";
import { createInferenceId, noopAttemptSink } from "./ai/attempts";
import {
  postGroqChatCompletion,
  groqFailureKind,
  isGroqDailyQuota,
} from "./ai/providers/groq";
import type { AttemptSink, InferenceAttempt } from "./ai/types";
import { UNKNOWN_USAGE } from "./ai/usage";

export { groqFailureKind, isGroqDailyQuota };

const SIGNAL_TYPES = new Set<SignalType>(["lead", "retention", "upsell"]);

/** Groq shut down `qwen/qwen3.6-27b` on 2026-09-14. Successor is 3.8. */
export const DEFAULT_DETECT_LLM_MODEL = "qwen/qwen3.8-27b";
/**
 * Used for the rest of a run when the primary model hits Groq's daily token cap.
 * gpt-oss rejects `reasoning_effort: none` (Qwen accepts it); the request body
 * switches to `low` for every non-Qwen id.
 */
export const FALLBACK_DETECT_LLM_MODEL = "openai/gpt-oss-20b";
import { DETECT_LLM_MAX_CALLS, detectLlmMaxCalls } from "./detect-llm-config";
export { DETECT_LLM_MAX_CALLS, detectLlmMaxCalls } from "./detect-llm-config";
/** Default 2 — Groq Free 429s at 8-wide; keep Hobby detect + Neon sync under 10s. */
export const DETECT_LLM_CONCURRENCY = 2;
export const DETECT_LLM_TIMEOUT_MS = 6_000;
/** Local pilot exports (about 100 chats) finish in one run when the cap is unset. */
export const DETECT_LLM_PRIMARY_LOCAL_MAX_CALLS = 120;
export const DETECT_LLM_MAX_ATTEMPTS = 3;
export const DETECT_LLM_MIN_INTERVAL_MS = 200;
export const DETECT_PROMPT_VERSION = "final-intent-recent-complete-turns-v2";

/**
 * Compact classifier prompt for small Qwen models (json_object mode).
 * Emits corpus labels (retention_risk / upsell_opportunity / lead_intent / none);
 * the parser maps those to product SignalType. Strict 5-key JSON only.
 */
export const SYSTEM_PROMPT = `Classify one Indian finance / broking / fintech support chat for Shadow Mode.

Return ONE JSON object. No markdown. No <think>. No extra keys. No prose.

{"signal":"retention_risk"|"upsell_opportunity"|"lead_intent"|"none","confidence":0.0,"evidence":"exact quote","next_action":"short action","reason":"one short sentence"}

Read EVERY customer message in order. Decide from the FINAL intent. Later turns override earlier ones.

Pick exactly one signal. If two fit, use this order: retention_risk > upsell_opportunity > lead_intent.
- retention_risk: customer will leave, close/delete/stop the account or app, switch broker, park funds elsewhere, pause trading, or "if this isn't fixed I'm gone". Informal wording counts. Ops-only frustration (crash, OTP, statement download) is none. Churn-shaped frustration (other app, stop using, close, parking SIPs elsewhere) is retention_risk.
- upsell_opportunity: EXISTING customer wants a DIFFERENT extra product (insurance, FD, loan against shares, F&O/margin/MTF, PMS/AIF, family view/account, RM, invest more, commodity) on the same login. Same-product upgrade is lead_intent.
- lead_intent: new buying intent (open account/wallet/card/loan, first product / first buy / first FD/ELSS/SIP, starting fresh, opening their own id, pricing with buy intent) OR same-product expansion (upgrade, limit raise, add-on card).
- none: OTP/login/password, KYC tech errors, statements, order status, polite chat, phishing/fraud/unauthorized/dispute with no leave intent, or unclear ops.

Rules:
- Prefer a product signal when the customer clearly asked to buy, leave, or add a distinct product — even if the wording is casual or mixed with Hindi.
- Fraud, phishing, fake-app, OTP/TPIN scams, and unauthorized charges are none — never upsell_opportunity, even if a product name appears (insurance they did not buy, etc.).
- Never invent products, names, or quotes.
- evidence = one verbatim CUSTOMER span copied exactly (same words, order, spelling). No paraphrase. No "Customer:". Shortest span that proves the signal (8-140 chars). Use "" when signal=none.
- If you cannot copy a real customer span, return signal=none and evidence="".
- next_action = one short Shadow Mode suggestion. Use "none" when signal=none.
- reason = one short sentence.
- confidence = a number from 0 to 1 (not a string). Use 0.8 or higher only if the customer said the intent in clear words.

Examples (later turns win):
"The fees are high." later: "I am closing my account and moving my portfolio."
{"signal":"retention_risk","confidence":0.86,"evidence":"I am closing my account and moving my portfolio","next_action":"Trigger retention playbook — same-day manager callback","reason":"Customer will close and shift the portfolio."}

"I already trade equity with you." later: "Do you offer loan against shares?"
{"signal":"upsell_opportunity","confidence":0.8,"evidence":"Do you offer loan against shares?","next_action":"Share LAS offer with their RM","reason":"Existing equity customer asked for a distinct add-on."}

"Hi." later: "I want to open a demat account. What are your charges?"
{"signal":"lead_intent","confidence":0.84,"evidence":"I want to open a demat account","next_action":"Route to sales with pricing and onboarding link","reason":"New-account buying intent with a pricing question."}

"This app is slow." later: "Please resend the login OTP to my registered mobile."
{"signal":"none","confidence":0.95,"evidence":"","next_action":"none","reason":"Later turn is login OTP, which is ops."}

"Paisa nikalna hai. Zerodha pe shift kar raha hoon."
{"signal":"retention_risk","confidence":0.84,"evidence":"Zerodha pe shift kar raha hoon","next_action":"Same-day callback before the transfer","reason":"Hinglish leave-and-switch intent."}

JSON object only.`;

export type LlmSignalType = SignalType | "none";

/** Corpus / small-model labels → product SignalType (or none). */
const LLM_TYPE_ALIASES: Record<string, LlmSignalType> = {
  none: "none",
  no_signal: "none",
  nosignal: "none",
  ops: "none",
  other: "none",
  n_a: "none",
  na: "none",
  null: "none",
  complaint: "none",
  fraud: "none",
  retention: "retention",
  retention_risk: "retention",
  churn: "retention",
  churn_risk: "retention",
  upsell: "upsell",
  upsell_opportunity: "upsell",
  cross_sell: "upsell",
  crosssell: "upsell",
  lead: "lead",
  lead_intent: "lead",
  qualified_lead: "lead",
};

export type LlmClassification = {
  type: LlmSignalType;
  confidence: number;
  summary: string;
  quotes: string[];
  context?: TranscriptContext & {
    promptVersion: string;
    model: string;
    stage?: "detect";
    routeVersion?: string;
  };
};

export type LlmClassifyFn = (input: {
  conversation: Conversation;
  customerMessages: Message[];
}) => Promise<LlmClassification | null>;

/** Why a Groq call did not return a classification. */
export type LlmFailureKind = "key" | "model" | "timeout" | "shape" | "quota";

export class LlmCallFailed extends Error {
  readonly kind: LlmFailureKind | null;
  readonly retryable: boolean;
  /** From the Retry-After header, when Groq sent one. */
  readonly retryAfterMs: number | null;
  /** Daily token cap (TPD). Retrying the same model will not succeed. */
  readonly dailyQuota: boolean;

  constructor(
    kind: LlmFailureKind | null,
    retryable = false,
    extra?: { retryAfterMs?: number | null; dailyQuota?: boolean }
  ) {
    super(kind ?? "llm_call_failed");
    this.name = "LlmCallFailed";
    this.kind = kind;
    this.retryable = retryable;
    this.retryAfterMs = extra?.retryAfterMs ?? null;
    this.dailyQuota = extra?.dailyQuota ?? kind === "quota";
  }
}

/** One detection run. A daily-quota switch sticks for later chats in the run. */
export type GroqModelSession = {
  model: string;
  /** Raised after a tokens-per-minute 429 so the rest of the run stays under the cap. */
  minGapMs: number;
};

export function createGroqModelSession(): GroqModelSession {
  return { model: detectLlmModel(), minGapMs: 0 };
}

export type LlmPassStats = {
  enabled: boolean;
  candidates: number;
  attempted: number;
  added: number;
  failed: number;
  skipped: number;
  /**
   * Candidate conversation ids left after this run, skipped-first order.
   * Present when pass 2 ran. The next re-detect classifies these before newer misses.
   */
  skippedIds?: string[];
  /** Attempted classifications that failed; excludes successful none and skipped work. */
  failedIds?: string[];
  /** Successful classifications, including explicit none outputs. */
  contexts?: Record<
    string,
    {
      model: string;
      promptVersion: string;
      stage?: "detect";
      routeVersion?: string;
    } & Partial<TranscriptContext>
  >;
  /** First diagnosed failure when `failed` > 0. Omitted when every call succeeded. */
  llmFailure?: LlmFailureKind;
  /** Set when the inference ledger could not be reached and the LLM pass did not run. */
  ledgerSkip?: "unreachable";
};

function llmFailureKindOf(err: unknown): LlmFailureKind | null {
  if (!err || typeof err !== "object" || !("kind" in err)) return null;
  const kind = (err as { kind?: unknown }).kind;
  if (
    kind === "key" ||
    kind === "model" ||
    kind === "timeout" ||
    kind === "shape" ||
    kind === "quota"
  ) {
    return kind;
  }
  return null;
}

function fallbackDetectLlmModel(current: string): string | null {
  const raw = process.env.DETECT_LLM_FALLBACK_MODEL;
  if (raw != null) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "0" || trimmed === "off") return null;
    if (trimmed === current) return null;
    return trimmed;
  }
  if (FALLBACK_DETECT_LLM_MODEL === current) return null;
  return FALLBACK_DETECT_LLM_MODEL;
}

export type HybridDetectResult = {
  signals: Signal[];
  llm: LlmPassStats;
};

export type HybridDetectOptions = {
  /**
   * Injectable classifier (tests and offline eval). When set, skip Groq even if env is off.
   * Provider attempt events are not emitted on this path; production routes must not pass it.
   */
  classify?: LlmClassifyFn;
  maxCalls?: number;
  concurrency?: number;
  /** Real heuristic ticks: 0 then 1…N conversations. */
  onProgress?: (done: number, total: number) => void | Promise<void>;
  /**
   * Chats skipped on the previous pass. Still-eligible ids are classified
   * before any other zero-signal miss.
   */
  resumeIds?: readonly string[];
  /** One event per provider fetch. Production passes the ledger sink when the preflight succeeds. */
  attemptSink?: AttemptSink;
  /** Ledger preflight failed. Heuristics still publish; no provider call runs. */
  skipLlm?: boolean;
};

function emptyStats(enabled: boolean): LlmPassStats {
  return {
    enabled,
    candidates: 0,
    attempted: 0,
    added: 0,
    failed: 0,
    skipped: 0,
    skippedIds: [],
  };
}


/** Primary mode is on unless explicitly set to 0. Second pass stays available. */
export function isLlmPrimaryEnabled(): boolean {
  return process.env.DETECT_LLM_PRIMARY !== "0";
}

/** Configured fallback id, or `off` when the operator disables the switch. */
function configuredFallbackModel(): string {
  const raw = process.env.DETECT_LLM_FALLBACK_MODEL;
  if (raw != null) {
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "0" || trimmed === "off") return "off";
    return trimmed;
  }
  return FALLBACK_DETECT_LLM_MODEL;
}

/**
 * Primary vs miss-only, plus the configured primary|fallback model pair.
 * This is the route that was selected, not the model a single attempt called.
 */
export function detectRouteVersion(): string {
  const mode = isLlmPrimaryEnabled() ? "primary" : "miss-only";
  return `detect:${mode}:${detectLlmModel()}|${configuredFallbackModel()}`;
}

/**
 * Honor DETECT_LLM_MAX_CALLS when set (Vercel Hobby stays small).
 * Otherwise cover a pilot export locally and keep the short cap on Vercel.
 */
export function detectLlmPrimaryMaxCalls(): number {
  if (process.env.DETECT_LLM_MAX_CALLS?.trim()) return detectLlmMaxCalls();
  if (process.env.VERCEL) return DETECT_LLM_MAX_CALLS;
  return DETECT_LLM_PRIMARY_LOCAL_MAX_CALLS;
}

export function isDetectLlmEnabled(): boolean {
  if (process.env.DETECT_LLM !== "1") return false;
  return Boolean(process.env.GROQ_API_KEY?.trim());
}

export function detectLlmModel(): string {
  return process.env.DETECT_LLM_MODEL?.trim() || DEFAULT_DETECT_LLM_MODEL;
}

function positiveEnvNumber(raw: string | undefined, fallback: number): number {
  const n = Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let nextGroqAt = 0;
let groqPace: Promise<void> = Promise.resolve();

function groqBaseGapMs(): number {
  const raw = process.env.DETECT_LLM_MIN_INTERVAL_MS;
  const parsed =
    raw == null || raw.trim() === "" ? DETECT_LLM_MIN_INTERVAL_MS : Number(raw);
  return Number.isFinite(parsed) ? parsed : DETECT_LLM_MIN_INTERVAL_MS;
}

/** Test isolation. Production pacing is module-level so concurrent calls share one queue. */
export function resetGroqPaceForTests(): void {
  nextGroqAt = 0;
  groqPace = Promise.resolve();
}

/**
 * After a tokens-per-minute 429, wait out Retry-After and keep later calls
 * in this run about 8s apart. 8000 TPM and a ~1100-token prompt cannot burst.
 * Vercel Hobby stays on the short gap so detect still fits the function limit.
 */
function noteGroqThrottle(session: GroqModelSession, retryAfterMs: number): void {
  if (process.env.VERCEL) return;
  if (groqBaseGapMs() <= 0) return;
  const sustained = Math.min(20_000, Math.max(retryAfterMs, 8_000));
  session.minGapMs = Math.max(session.minGapMs, sustained);
  const until = Date.now() + retryAfterMs;
  if (until > nextGroqAt) nextGroqAt = until;
}

/** Space Groq calls so a pilot batch does not burst the free-tier limit. */
export async function paceGroqCall(session?: GroqModelSession): Promise<void> {
  const base = groqBaseGapMs();
  if (base <= 0) return;
  const gap = Math.max(base, session?.minGapMs ?? 0);
  const ticket = groqPace.then(async () => {
    const wait = nextGroqAt - Date.now();
    if (wait > 0) await sleep(wait);
    nextGroqAt = Date.now() + gap;
  });
  groqPace = ticket.then(
    () => undefined,
    () => undefined
  );
  await ticket;
}

type GroqAttemptScope = {
  sink: AttemptSink;
  logicalOperationId: string;
  ordinals: { next: number };
  tenantId: string;
  conversationId?: string;
  routeVersion: string;
  promptVersion: string;
};

async function requestGroqClassification(
  apiKey: string,
  messages: ClassifyChatMessage[],
  session: GroqModelSession,
  scope: GroqAttemptScope
): Promise<LlmClassification> {
  await paceGroqCall(session);
  const model = session.model;
  scope.ordinals.next += 1;
  const attemptOrdinal = scope.ordinals.next;
  const startedMs = Date.now();
  let status: InferenceAttempt["status"] = "failed";
  let errorCategory: InferenceAttempt["errorCategory"];
  let httpStatus: number | undefined;
  let providerRequestId: string | undefined;
  let usage = UNKNOWN_USAGE;
  let attemptId: string | undefined;
  try {
    const transport = await postGroqChatCompletion({
      apiKey,
      model,
      messages,
      timeoutMs: DETECT_LLM_TIMEOUT_MS,
    });
    attemptId = transport.attemptId;
    providerRequestId = transport.providerRequestId;
    usage = transport.usage;
    httpStatus = transport.httpStatus;
    if (!transport.ok) {
      if (transport.reason === "timeout") status = "timeout";
      if (transport.failureKind) errorCategory = transport.failureKind;
      else if (transport.reason === "network") errorCategory = "network";
      if (
        transport.reason === "http" &&
        !transport.dailyQuota &&
        transport.retryAfterMs != null &&
        transport.retryAfterMs > 0
      ) {
        noteGroqThrottle(session, transport.retryAfterMs);
      }
      throw new LlmCallFailed(transport.failureKind, transport.retryable, {
        retryAfterMs: transport.retryAfterMs,
        dailyQuota: transport.dailyQuota,
      });
    }
    const parsed =
      (transport.content ? parseLlmClassificationJson(transport.content) : null) ??
      (transport.reasoning ? parseLlmClassificationJson(transport.reasoning) : null);
    if (!parsed) {
      errorCategory = "shape";
      throw new LlmCallFailed("shape");
    }
    status = "succeeded";
    return parsed;
  } catch (err) {
    if (!(err instanceof LlmCallFailed) && !errorCategory) errorCategory = "network";
    throw err;
  } finally {
    if (attemptId) {
      const finishedMs = Date.now();
      try {
        scope.sink({
          attemptId,
          logicalOperationId: scope.logicalOperationId,
          attemptOrdinal,
          tenantId: scope.tenantId,
          ...(scope.conversationId ? { conversationId: scope.conversationId } : {}),
          stage: "detect",
          routeVersion: scope.routeVersion,
          provider: "groq",
          model,
          promptVersion: scope.promptVersion,
          startedAt: new Date(startedMs).toISOString(),
          finishedAt: new Date(finishedMs).toISOString(),
          latencyMs: finishedMs - startedMs,
          status,
          ...(errorCategory ? { errorCategory } : {}),
          ...(httpStatus != null ? { httpStatus } : {}),
          ...(providerRequestId ? { providerRequestId } : {}),
          usage,
        });
      } catch {
        console.warn(
          `Detect LLM attempt sink failed for attempt ${attemptId} (status=${status}, http=${httpStatus ?? "n/a"}).`
        );
      }
    }
  }
}

function collapseWs(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function customerText(messages: Message[]): string {
  return messages
    .filter((m) => m.role === "customer")
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join("\n");
}


function stripSpeakerPrefix(quote: string): string {
  return quote.replace(/^(customer|user|client)\s*:\s*/i, "").trim();
}

/** Fold punctuation so small-model quotes still match customer text. */
function foldText(text: string): string {
  return collapseWs(text)
    .toLowerCase()
    .replace(/[\u2018\u2019\u201A\u201B`]/g, "'")
    .replace(/[\u201C\u201D\u201E\u00AB\u00BB]/g, '"')
    .replace(/[\u2013\u2014\u2026.,!?;:#*~_/=+|\\[\]{}()<>"'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function spanFromFoldedIndex(
  pairs: { word: string; folded: string }[],
  foldedCharIndex: number,
  foldedLen: number
): string | null {
  let cursor = 0;
  let startPair = -1;
  let endPair = -1;
  const end = foldedCharIndex + foldedLen;
  for (let i = 0; i < pairs.length; i++) {
    const tokenLen = pairs[i].folded.length;
    const tokenStart = cursor;
    const tokenEnd = cursor + tokenLen;
    if (startPair < 0 && tokenEnd > foldedCharIndex) startPair = i;
    if (tokenStart < end) endPair = i;
    cursor = tokenEnd + 1;
  }
  if (startPair < 0 || endPair < startPair) return null;
  return pairs
    .slice(startPair, endPair + 1)
    .map((p) => p.word)
    .join(" ");
}

/**
 * Recover a verbatim customer span from a model quote.
 * Accepts exact, punctuation-folded, and ≥4-token consecutive runs.
 */
export function recoverGroundedQuote(
  quote: string,
  source: string
): string | null {
  const needle = collapseWs(stripSpeakerPrefix(quote)).replace(
    /^["'\u201C\u201D]+|["'\u201C\u201D]+$/g,
    ""
  );
  if (needle.length < 8) return null;
  const hay = collapseWs(source);
  if (!hay) return null;

  const exact = hay.toLowerCase().indexOf(needle.toLowerCase());
  if (exact >= 0) return hay.slice(exact, exact + needle.length);

  const foldedNeedle = foldText(needle);
  if (foldedNeedle.length < 8) return null;

  const words = hay.split(" ");
  const pairs: { word: string; folded: string }[] = [];
  for (const word of words) {
    const folded = foldText(word);
    if (folded) pairs.push({ word, folded });
  }
  if (pairs.length === 0) return null;

  const foldedJoined = pairs.map((p) => p.folded).join(" ");
  const foldedIdx = foldedJoined.indexOf(foldedNeedle);
  if (foldedIdx >= 0) {
    const span = spanFromFoldedIndex(pairs, foldedIdx, foldedNeedle.length);
    if (span && span.length >= 8) return span;
  }

  const needleToks = foldedNeedle.split(" ").filter(Boolean);
  if (needleToks.length < 4) return null;
  for (let len = needleToks.length; len >= 4; len--) {
    for (let start = 0; start + len <= needleToks.length; start++) {
      const run = needleToks.slice(start, start + len).join(" ");
      const at = foldedJoined.indexOf(run);
      if (at < 0) continue;
      const span = spanFromFoldedIndex(pairs, at, run.length);
      if (span && span.length >= 8) return span;
    }
  }
  return null;
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value;
  }
  return "";
}

function quoteFromUnknown(item: unknown): string | null {
  if (typeof item === "string") {
    const text = collapseWs(item);
    return text || null;
  }
  if (!item || typeof item !== "object") return null;
  const rec = item as Record<string, unknown>;
  const nested = firstString(rec.quote, rec.text, rec.span, rec.evidence);
  return nested || null;
}

function collectQuotes(...buckets: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const bucket of buckets) {
    const items = Array.isArray(bucket)
      ? bucket
      : bucket === undefined || bucket === null
        ? []
        : [bucket];
    for (const item of items) {
      const quote = quoteFromUnknown(item);
      if (!quote) continue;
      const key = quote.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(quote);
      if (out.length >= 2) return out;
    }
  }
  return out;
}

function normalizeTypeKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function resolveLlmType(...values: unknown[]): LlmSignalType | null {
  for (const value of values) {
    if (typeof value !== "string") continue;
    const mapped = LLM_TYPE_ALIASES[normalizeTypeKey(value)];
    if (mapped) return mapped;
    const lowered = value.trim().toLowerCase();
    if (SIGNAL_TYPES.has(lowered as SignalType)) return lowered as SignalType;
  }
  return null;
}

function parseClassification(raw: unknown): LlmClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const type = resolveLlmType(o.type, o.signal, o.label, o.category);
  if (!type) return null;

  const confidenceRaw = Number(
    o.confidence ?? o.score ?? o.confidence_score
  );
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.55;

  const summary = collapseWs(
    firstString(o.summary, o.reason, o.rationale, o.explanation)
  );

  const quotes = collectQuotes(o.quotes, o.evidence, o.quote, o.spans);

  return { type, confidence, summary, quotes };
}

/** Parse small-model chat content: think tags, markdown fences, first JSON object. */
export function parseLlmClassificationJson(
  content: string
): LlmClassification | null {
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (!stripped) return null;

  const fenced = stripped.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = (fenced?.[1] ?? stripped).trim();

  const attempts = [body];
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start >= 0 && end > start) {
    attempts.push(body.slice(start, end + 1));
  }

  for (const attempt of attempts) {
    try {
      const parsed = parseClassification(JSON.parse(attempt) as unknown);
      if (parsed) return parsed;
    } catch {
      continue;
    }
  }
  return null;
}

export type ClassifyChatMessage = {
  role: "system" | "user";
  content: string;
};

/** Same system+user payload production Groq and Promptfoo live eval must send. */
export function classifyChatMessages(input: {
  customerName?: string | null;
  channel?: string;
  customerText: string;
  omittedTurns?: number;
}): ClassifyChatMessage[] {
  const who = pseudonymCustomerName(input.customerName) ?? "Customer";
  const channel = input.channel || "chat";
  const contextNote = input.omittedTurns ? `Earlier ${input.omittedTurns} customer turns were omitted for the context budget. Decide from the complete recent turns below.\n` : "";
  const userPrompt = `${contextNote}Classify this chat. Return the JSON object only.\n\nCustomer: ${who}\nChannel: ${channel}\n\nCustomer messages:\n${redactText(input.customerText)}`;
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: userPrompt },
  ];
}

export async function classifyConversationWithGroq(
  input: {
    conversation: Conversation;
    customerMessages: Message[];
  },
  session: GroqModelSession = createGroqModelSession(),
  telemetry?: { attemptSink?: AttemptSink; tenantId?: string }
): Promise<LlmClassification | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  let transcript: ReturnType<typeof recentCustomerTranscript>;
  try {
    transcript = recentCustomerTranscript(input.customerMessages);
  } catch {
    throw new LlmCallFailed("shape", false);
  }
  const text = transcript.text;
  if (!text) return null;

  const messages = classifyChatMessages({
    customerName: input.conversation.customerName,
    channel: input.conversation.channel,
    customerText: text,
    omittedTurns: transcript.context.omittedTurns,
  });

  const maxAttempts = Math.min(
    4,
    Math.max(1, Math.floor(positiveEnvNumber(
      process.env.DETECT_LLM_MAX_ATTEMPTS,
      DETECT_LLM_MAX_ATTEMPTS
    )))
  );
  const scope: GroqAttemptScope = {
    sink: telemetry?.attemptSink ?? noopAttemptSink,
    logicalOperationId: createInferenceId(),
    ordinals: { next: 0 },
    tenantId: telemetry?.tenantId ?? input.conversation.tenantId,
    conversationId: input.conversation.id,
    routeVersion: detectRouteVersion(),
    promptVersion: DETECT_PROMPT_VERSION,
  };
  let lastError: unknown = new LlmCallFailed("shape");
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const modelUsed = session.model;
    try {
      const result = await requestGroqClassification(apiKey, messages, session, scope);
      return {
        ...result,
        context: {
          ...transcript.context,
          promptVersion: DETECT_PROMPT_VERSION,
          model: session.model,
          stage: "detect",
          routeVersion: scope.routeVersion,
        },
      };
    } catch (err) {
      lastError = err;
      if (err instanceof LlmCallFailed && err.dailyQuota) {
        if (session.model !== modelUsed) {
          attempt -= 1;
          continue;
        }
        const next = fallbackDetectLlmModel(session.model);
        if (next) {
          console.warn(
            `Detect LLM daily token limit on ${session.model}; switching to ${next}.`
          );
          session.model = next;
          attempt -= 1;
          continue;
        }
        throw err;
      }
      const retryable = err instanceof LlmCallFailed && err.retryable;
      if (!retryable || attempt >= maxAttempts - 1) throw err;
      const hinted = err instanceof LlmCallFailed ? err.retryAfterMs : null;
      const cap = process.env.VERCEL ? 1_500 : 20_000;
      if (hinted != null && hinted > 0) {
        if (hinted > cap) throw err;
        if (process.env.VERCEL || groqBaseGapMs() <= 0) {
          await sleep(Math.min(hinted, cap));
        }
        continue;
      }
      await sleep(200 * 2 ** attempt);
    }
  }
  throw lastError;
}

function signalFromClassification(
  conversation: Conversation,
  tenantId: string,
  classification: LlmClassification,
  sourceText: string,
  overrides?: TaxonomyOverrides | null,
  model?: string
): Signal | null {
  if (classification.type === "none") return null;
  if (classification.confidence < SCORE_THRESHOLD) return null;

  const groundedQuotes: string[] = [];
  const seenQuotes = new Set<string>();
  for (const quote of classification.quotes) {
    const recovered = recoverGroundedQuote(quote, sourceText);
    if (!recovered) continue;
    const clipped = clipQuote(recovered);
    const key = clipped.toLowerCase();
    if (seenQuotes.has(key)) continue;
    seenQuotes.add(key);
    groundedQuotes.push(`quote: "${clipped}"`);
    if (groundedQuotes.length >= 2) break;
  }

  const summary = classification.summary.trim();
  if (groundedQuotes.length === 0) return null;

  const evidence = [
    ...groundedQuotes.slice(0, 2),
    `llm: ${model || detectLlmModel()}`,
  ];
  const score = Number(classification.confidence.toFixed(3));
  const who = pseudonymCustomerName(conversation.customerName) ?? "Customer";
  const via = conversation.channel ? ` (${conversation.channel})` : "";

  return attachSignalCommercial(
    {
      id: `sig_${conversation.id}_${classification.type}_llm`,
      tenantId,
      conversationId: conversation.id,
      type: classification.type,
      score,
      confidence: score,
      ...(classification.context ? { detectionContext: classification.context } : {}),
      summary:
        summary ||
        `${who}${via} may be a ${classification.type} signal — review before acting.`,
      suggestedAction: resolveSuggestedAction({
        type: classification.type,
        customerName: who,
        evidence,
        fallback: pickAction(classification.type, score, overrides),
      }),
      evidence,
      status: "new",
      createdAt: new Date().toISOString(),
      groundTruth: conversation.groundTruth,
    },
    sourceText
  );
}

/**
 * Previously skipped chats stay ahead of every other zero-signal miss.
 * Unknown or already-covered ids drop out. The remainder keeps length order.
 */
function prioritizeSkippedCandidates<T extends { conversation: Conversation }>(
  candidates: T[],
  resumeIds: readonly string[] | undefined
): T[] {
  if (!resumeIds || resumeIds.length === 0) return candidates;
  const byId = new Map(candidates.map((row) => [row.conversation.id, row]));
  const first: T[] = [];
  const seen = new Set<string>();
  for (const id of resumeIds) {
    if (seen.has(id)) continue;
    const row = byId.get(id);
    if (!row) continue;
    seen.add(id);
    first.push(row);
  }
  if (first.length === 0) return candidates;
  const rest = candidates.filter((row) => !seen.has(row.conversation.id));
  return [...first, ...rest];
}

function bindGroqClassify(
  classify: LlmClassifyFn | undefined,
  options: HybridDetectOptions | undefined,
  tenantId: string
): {
  classify: LlmClassifyFn;
  modelName: () => string;
} {
  if (classify) return { classify, modelName: () => detectLlmModel() };
  const session = createGroqModelSession();
  return {
    classify: (input) =>
      classifyConversationWithGroq(input, session, {
        attemptSink: options?.attemptSink,
        tenantId,
      }),
    modelName: () => session.model,
  };
}

/**
 * Add LLM signals only for conversations heuristics did not fire on.
 * Does not replace or rewrite heuristic signals (precision gate).
 * At most `maxCalls` Groq calls. Chats past the cap are returned as
 * `skippedIds` so the next re-detect classifies them first.
 */
export async function applyLlmSecondPass(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  heuristicSignals: Signal[],
  overrides?: TaxonomyOverrides | null,
  options?: HybridDetectOptions
): Promise<HybridDetectResult> {
  const classify = options?.classify;
  const enabled = Boolean(classify) || isDetectLlmEnabled();
  if (!enabled) {
    return { signals: heuristicSignals, llm: emptyStats(false) };
  }

  const byConversation = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  const covered = new Set(heuristicSignals.map((s) => s.conversationId));
  const candidates = conversations
    .filter((c) => !covered.has(c.id))
    .map((conversation) => ({
      conversation,
      customerMessages: (byConversation.get(conversation.id) ?? []).filter(
        (m) => m.role === "customer"
      ),
    }))
    .filter((row) => customerText(row.customerMessages).length > 0)
    .sort(
      (a, b) =>
        customerText(b.customerMessages).length -
        customerText(a.customerMessages).length
    );

  const maxCalls = Math.max(0, options?.maxCalls ?? detectLlmMaxCalls());
  const ordered = prioritizeSkippedCandidates(candidates, options?.resumeIds);
  const selected = ordered.slice(0, maxCalls);
  const skippedIds = ordered
    .slice(selected.length)
    .map((row) => row.conversation.id);
  const skipped = skippedIds.length;
  const bound = bindGroqClassify(classify, options, tenantId);
  const concurrency = Math.max(
    1,
    options?.concurrency ??
      positiveEnvNumber(
        process.env.DETECT_LLM_CONCURRENCY,
        DETECT_LLM_CONCURRENCY
      )
  );

  const added: Signal[] = [];
  let attempted = 0;
  let failed = 0;
  const failedIds = new Set<string>();
  let llmFailure: LlmFailureKind | undefined;
  const contexts: NonNullable<LlmPassStats["contexts"]> = {};

  await mapWithConcurrency(selected, concurrency, async (row) => {
    attempted += 1;
    try {
      const result = await bound.classify(row);
      if (!result) {
        failed += 1;
        failedIds.add(row.conversation.id);
        return;
      }
      const context = result.context ?? { model: bound.modelName(), promptVersion: DETECT_PROMPT_VERSION };
      const source = customerText(row.customerMessages);
      const signal = signalFromClassification(
        row.conversation,
        tenantId,
        result,
        source,
        overrides,
        bound.modelName()
      );
      if (signal || result.type === "none") {
        contexts[row.conversation.id] = { ...context };
        if (signal) added.push(signal);
      } else {
        failed += 1;
        failedIds.add(row.conversation.id);
      }
    } catch (err) {
      failed += 1;
      failedIds.add(row.conversation.id);
      const kind = llmFailureKindOf(err);
      if (!llmFailure && kind) llmFailure = kind;
    }
  });

  return {
    signals: [...heuristicSignals, ...added],
    llm: {
      enabled: true,
      candidates: candidates.length,
      attempted,
      added: added.length,
      failed,
      skipped,
      skippedIds,
      failedIds: selected.filter((row) => failedIds.has(row.conversation.id)).map((row) => row.conversation.id),
      contexts,
      ...(llmFailure ? { llmFailure } : {}),
    },
  };
}

/**
 * LLM classifies every chat with customer text. Heuristic hits stay only
 * when the model fails, the quote is not grounded, or the call cap skips
 * the chat. An explicit `none` drops the heuristic hit for that chat.
 */
export async function applyLlmPrimaryPass(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  heuristicSignals: Signal[],
  overrides?: TaxonomyOverrides | null,
  options?: HybridDetectOptions
): Promise<HybridDetectResult> {
  const classify = options?.classify;
  const enabled = Boolean(classify) || isDetectLlmEnabled();
  if (!enabled) {
    return { signals: heuristicSignals, llm: emptyStats(false) };
  }

  const byConversation = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }

  const candidates = conversations
    .map((conversation) => ({
      conversation,
      customerMessages: (byConversation.get(conversation.id) ?? []).filter(
        (m) => m.role === "customer"
      ),
    }))
    .filter((row) => customerText(row.customerMessages).length > 0)
    .sort(
      (a, b) =>
        customerText(b.customerMessages).length -
        customerText(a.customerMessages).length
    );

  const maxCalls = Math.max(
    0,
    options?.maxCalls ?? detectLlmPrimaryMaxCalls()
  );
  const ordered = prioritizeSkippedCandidates(candidates, options?.resumeIds);
  const selected = ordered.slice(0, maxCalls);
  const skippedIds = ordered.slice(selected.length).map((row) => row.conversation.id);
  const bound = bindGroqClassify(classify, options, tenantId);
  const concurrency = Math.max(
    1,
    options?.concurrency ??
      positiveEnvNumber(
        process.env.DETECT_LLM_CONCURRENCY,
        DETECT_LLM_CONCURRENCY
      )
  );

  const accepted = new Map<string, Signal>();
  const dropped = new Set<string>();
  let attempted = 0;
  let failed = 0;
  const failedIds = new Set<string>();
  let llmFailure: LlmFailureKind | undefined;
  const contexts: NonNullable<LlmPassStats["contexts"]> = {};

  await mapWithConcurrency(selected, concurrency, async (row) => {
    attempted += 1;
    try {
      const result = await bound.classify(row);
      if (!result) {
        failed += 1;
        failedIds.add(row.conversation.id);
        return;
      }
      if (result.type === "none") {
        const context = result.context ?? { model: bound.modelName(), promptVersion: DETECT_PROMPT_VERSION };
        contexts[row.conversation.id] = { ...context };
        dropped.add(row.conversation.id);
        return;
      }
      const context = result.context ?? { model: bound.modelName(), promptVersion: DETECT_PROMPT_VERSION };
      const source = customerText(row.customerMessages);
      const signal = signalFromClassification(
        row.conversation,
        tenantId,
        result,
        source,
        overrides,
        bound.modelName()
      );
      if (signal) {
        contexts[row.conversation.id] = { ...context };
        accepted.set(row.conversation.id, signal);
      } else {
        failed += 1;
        failedIds.add(row.conversation.id);
      }
    } catch (err) {
      failed += 1;
      failedIds.add(row.conversation.id);
      const kind = llmFailureKindOf(err);
      if (!llmFailure && kind) llmFailure = kind;
    }
  });

  const kept = heuristicSignals.filter(
    (signal) =>
      !accepted.has(signal.conversationId) && !dropped.has(signal.conversationId)
  );

  return {
    signals: [...kept, ...accepted.values()],
    llm: {
      enabled: true,
      candidates: candidates.length,
      attempted,
      added: accepted.size,
      failed,
      skipped: skippedIds.length,
      skippedIds,
      failedIds: selected.filter((row) => failedIds.has(row.conversation.id)).map((row) => row.conversation.id),
      contexts,
      ...(llmFailure ? { llmFailure } : {}),
    },
  };
}

export async function runHybridDetection(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  overrides?: TaxonomyOverrides | null,
  options?: HybridDetectOptions
): Promise<HybridDetectResult> {
  const heuristic = options?.onProgress
    ? await runDetectionWithProgress(
        conversations,
        messages,
        tenantId,
        overrides,
        options.onProgress
      )
    : runDetection(conversations, messages, tenantId, overrides);
  if (options?.skipLlm) {
    return {
      signals: heuristic,
      llm: { ...emptyStats(false), ledgerSkip: "unreachable" },
    };
  }
  if (!isLlmPrimaryEnabled()) {
    return applyLlmSecondPass(
      conversations,
      messages,
      tenantId,
      heuristic,
      overrides,
      options
    );
  }
  return applyLlmPrimaryPass(
    conversations,
    messages,
    tenantId,
    heuristic,
    overrides,
    options
  );
}
