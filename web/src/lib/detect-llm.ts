/**
 * Detect v2 pass 2: managed Groq Qwen classifier on conversations
 * heuristics left as none. Env-gated; fail-soft; never overrides a heuristic hit.
 */

import { clipQuote } from "./clip-quote";
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

const SIGNAL_TYPES = new Set<SignalType>(["lead", "retention", "upsell"]);

/** Groq shut down `qwen/qwen3.6-27b` on 2026-09-14. Successor is 3.8. */
export const DEFAULT_DETECT_LLM_MODEL = "qwen/qwen3.8-27b";
export const DETECT_LLM_MAX_CALLS = 8;
/** Default 2 — Groq Free 429s at 8-wide; keep Hobby detect + Neon sync under 10s. */
export const DETECT_LLM_CONCURRENCY = 2;
export const DETECT_LLM_TIMEOUT_MS = 6_000;
const CUSTOMER_TEXT_MAX = 2_400;

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

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
};

export type LlmClassifyFn = (input: {
  conversation: Conversation;
  customerMessages: Message[];
}) => Promise<LlmClassification | null>;

/** Why a Groq call did not return a classification. */
export type LlmFailureKind = "key" | "model" | "timeout" | "shape";

export class LlmCallFailed extends Error {
  readonly kind: LlmFailureKind | null;

  constructor(kind: LlmFailureKind | null) {
    super(kind ?? "llm_call_failed");
    this.name = "LlmCallFailed";
    this.kind = kind;
  }
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
  /** First diagnosed failure when `failed` > 0. Omitted when every call succeeded. */
  llmFailure?: LlmFailureKind;
};

/**
 * Map a Groq HTTP error onto key / model. Other statuses stay undiagnosed
 * so a 429 is not labeled as a bad response body.
 */
export function groqFailureKind(
  status: number,
  body: string
): LlmFailureKind | null {
  const text = body.toLowerCase();
  if (
    status === 401 ||
    status === 403 ||
    text.includes("invalid api key") ||
    text.includes("invalid_api_key") ||
    text.includes("expired_api_key")
  ) {
    return "key";
  }
  const modelGone =
    text.includes("does not exist") ||
    text.includes("decommission") ||
    text.includes("not found") ||
    text.includes("no longer") ||
    text.includes("deprecated") ||
    text.includes("model_not_found");
  if ((status === 400 || status === 404) && text.includes("model") && modelGone) {
    return "model";
  }
  if (status === 404 && text.includes("model")) return "model";
  return null;
}

function llmFailureKindOf(err: unknown): LlmFailureKind | null {
  if (!err || typeof err !== "object" || !("kind" in err)) return null;
  const kind = (err as { kind?: unknown }).kind;
  if (kind === "key" || kind === "model" || kind === "timeout" || kind === "shape") {
    return kind;
  }
  return null;
}

function isAbortError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const name = "name" in err ? String(err.name) : "";
  if (name === "AbortError" || name === "TimeoutError") return true;
  const message = "message" in err ? String(err.message) : "";
  return /abort|timeout/i.test(message);
}

export type HybridDetectResult = {
  signals: Signal[];
  llm: LlmPassStats;
};

export type HybridDetectOptions = {
  /** Injectable classifier (tests). When set, skip Groq even if env is off. */
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

export function detectLlmMaxCalls(): number {
  return positiveEnvNumber(
    process.env.DETECT_LLM_MAX_CALLS,
    DETECT_LLM_MAX_CALLS
  );
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

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
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

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let next = 0;

  async function worker() {
    while (true) {
      const index = next;
      next += 1;
      if (index >= items.length) return;
      results[index] = await mapper(items[index], index);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), items.length);
  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return results;
}

/** Corpus labels the Groq classifier is allowed to emit. */
export const DETECT_LLM_CORPUS_SIGNALS = [
  "retention_risk",
  "upsell_opportunity",
  "lead_intent",
  "none",
] as const;

export type DetectLlmCorpusSignal = (typeof DETECT_LLM_CORPUS_SIGNALS)[number];

/**
 * Same user prompt the Groq classifier sends. Null when there is no
 * customer text (classifyConversationWithGroq returns null in that case).
 */
export function buildDetectLlmUserPrompt(input: {
  conversation: Pick<Conversation, "customerName" | "channel">;
  customerMessages: Message[];
}): string | null {
  const text = truncate(customerText(input.customerMessages), CUSTOMER_TEXT_MAX);
  if (!text) return null;
  const who = input.conversation.customerName ?? "Customer";
  const channel = input.conversation.channel || "chat";
  return `Classify this chat. Return the JSON object only.\n\nCustomer: ${who}\nChannel: ${channel}\n\nCustomer messages:\n${text}`;
}

/**
 * Raw Groq completion used by Detect v2 and Promptfoo. Same model, JSON
 * mode, and reasoning flags as production. Throws LlmCallFailed.
 */
export async function requestDetectLlmCompletion(userPrompt: string): Promise<{
  content: string;
  reasoning: string;
}> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new LlmCallFailed("key");
  }

  const { signal, clear } = timeoutSignal(DETECT_LLM_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(GROQ_CHAT_URL, {
      method: "POST",
      signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: detectLlmModel(),
        temperature: 0,
        // 3.8 thinks by default. JSON mode 400s on raw reasoning, and a
        // 6s abort would look like a timeout. Instruct mode keeps the
        // JSON in message.content.
        reasoning_effort: "none",
        reasoning_format: "hidden",
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch (err) {
    throw new LlmCallFailed(isAbortError(err) ? "timeout" : null);
  } finally {
    clear();
  }

  if (!response.ok) {
    let detail = "";
    try {
      detail = typeof response.text === "function" ? await response.text() : "";
    } catch {
      detail = "";
    }
    throw new LlmCallFailed(groqFailureKind(response.status, detail));
  }

  let payload: {
    choices?: Array<{ message?: { content?: string; reasoning?: string } }>;
  };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    throw new LlmCallFailed("shape");
  }

  const message = payload.choices?.[0]?.message;
  const content = typeof message?.content === "string" ? message.content : "";
  const reasoning =
    typeof message?.reasoning === "string" ? message.reasoning : "";
  return { content, reasoning };
}

export async function classifyConversationWithGroq(input: {
  conversation: Conversation;
  customerMessages: Message[];
}): Promise<LlmClassification | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const userPrompt = buildDetectLlmUserPrompt(input);
  if (!userPrompt) return null;

  const { content, reasoning } = await requestDetectLlmCompletion(userPrompt);
  const parsed =
    (content ? parseLlmClassificationJson(content) : null) ??
    (reasoning ? parseLlmClassificationJson(reasoning) : null);
  if (!parsed) throw new LlmCallFailed("shape");
  return parsed;
}

function timeoutSignal(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function signalFromClassification(
  conversation: Conversation,
  tenantId: string,
  classification: LlmClassification,
  sourceText: string,
  overrides?: TaxonomyOverrides | null
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
  if (groundedQuotes.length === 0 && summary.length < 20) return null;

  const evidence = [
    ...groundedQuotes.slice(0, 2),
    `llm: ${detectLlmModel()}`,
  ];
  const score = Number(classification.confidence.toFixed(3));
  const who = conversation.customerName ?? "Customer";
  const via = conversation.channel ? ` (${conversation.channel})` : "";

  return {
    id: `sig_${conversation.id}_${classification.type}_llm`,
    tenantId,
    conversationId: conversation.id,
    type: classification.type,
    score,
    confidence: score,
    summary:
      summary ||
      `${who}${via} may be a ${classification.type} signal — review before acting.`,
    suggestedAction: resolveSuggestedAction({
      type: classification.type,
      customerName: conversation.customerName,
      evidence,
      fallback: pickAction(classification.type, score, overrides),
    }),
    evidence,
    status: "new",
    createdAt: new Date().toISOString(),
    groundTruth: conversation.groundTruth,
  };
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
  const classifyFn = classify ?? classifyConversationWithGroq;
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
  let llmFailure: LlmFailureKind | undefined;

  await mapWithConcurrency(selected, concurrency, async (row) => {
    attempted += 1;
    try {
      const result = await classifyFn(row);
      if (!result) {
        failed += 1;
        return;
      }
      const source = customerText(row.customerMessages);
      const signal = signalFromClassification(
        row.conversation,
        tenantId,
        result,
        source,
        overrides
      );
      if (signal) added.push(signal);
    } catch (err) {
      failed += 1;
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
  return applyLlmSecondPass(
    conversations,
    messages,
    tenantId,
    heuristic,
    overrides,
    options
  );
}
