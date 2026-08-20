/**
 * Detect v2 pass 2: managed Groq Qwen classifier on conversations
 * heuristics left as none. Env-gated; fail-soft; never overrides a heuristic hit.
 */

import {
  pickAction,
  runDetection,
  runDetectionWithProgress,
  SCORE_THRESHOLD,
} from "./detect";
import type {
  Conversation,
  Message,
  Signal,
  SignalType,
  TaxonomyOverrides,
} from "./types";

const SIGNAL_TYPES = new Set<SignalType>(["lead", "retention", "upsell"]);

export const DEFAULT_DETECT_LLM_MODEL = "qwen/qwen3.6-27b";
export const DETECT_LLM_MAX_CALLS = 8;
/** Default 2 — Groq Free 429s at 8-wide; keep Hobby detect + Neon sync under 10s. */
export const DETECT_LLM_CONCURRENCY = 2;
export const DETECT_LLM_TIMEOUT_MS = 6_000;
const CUSTOMER_TEXT_MAX = 2_400;
const QUOTE_MAX = 140;

const GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions";

const SYSTEM_PROMPT = `You classify one customer chat for an Indian finance / broking / fintech support desk.

Return JSON only:
{"type":"retention"|"upsell"|"lead"|"none","confidence":0.0,"summary":"1-2 sentences","quotes":["verbatim customer quote"]}

Rules:
- Primary signal is RETENTION: churn, account closure, cancel card, shifting broker/portfolio, deleting account, "thinking of leaving".
- lead = new buying intent (open account, first product, first credit card).
- upsell = existing customer wanting more (top-up, upgrade, invest more).
- none = ops, KYC, password/OTP, statements, polite chat, complaints without leave intent, fraud.
- If unsure between a revenue signal and ops, return none (protect precision).
- quotes must be verbatim substrings of customer messages (max 2).
- Never invent products, names, or quotes.`;

export type LlmSignalType = SignalType | "none";

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

export type LlmPassStats = {
  enabled: boolean;
  candidates: number;
  attempted: number;
  added: number;
  failed: number;
  skipped: number;
};

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
};

function emptyStats(enabled: boolean): LlmPassStats {
  return {
    enabled,
    candidates: 0,
    attempted: 0,
    added: 0,
    failed: 0,
    skipped: 0,
  };
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

function clipQuote(text: string, max = QUOTE_MAX): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
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

function quoteIsGrounded(quote: string, source: string): boolean {
  const needle = quote.replace(/\s+/g, " ").trim().toLowerCase();
  if (needle.length < 8) return false;
  const hay = source.replace(/\s+/g, " ").toLowerCase();
  return hay.includes(needle);
}

function parseClassification(raw: unknown): LlmClassification | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const typeRaw = typeof o.type === "string" ? o.type.trim().toLowerCase() : "";
  const type: LlmSignalType | null =
    typeRaw === "none"
      ? "none"
      : SIGNAL_TYPES.has(typeRaw as SignalType)
        ? (typeRaw as SignalType)
        : null;
  if (!type) return null;

  const confidenceRaw = Number(o.confidence);
  const confidence = Number.isFinite(confidenceRaw)
    ? Math.min(1, Math.max(0, confidenceRaw))
    : 0.55;

  const summary =
    typeof o.summary === "string" ? o.summary.replace(/\s+/g, " ").trim() : "";

  const quotes = Array.isArray(o.quotes)
    ? o.quotes
        .filter((q): q is string => typeof q === "string")
        .map((q) => q.replace(/\s+/g, " ").trim())
        .filter(Boolean)
        .slice(0, 2)
    : [];

  return { type, confidence, summary, quotes };
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

export async function classifyConversationWithGroq(input: {
  conversation: Conversation;
  customerMessages: Message[];
}): Promise<LlmClassification | null> {
  const apiKey = process.env.GROQ_API_KEY?.trim();
  if (!apiKey) return null;

  const text = truncate(customerText(input.customerMessages), CUSTOMER_TEXT_MAX);
  if (!text) return null;

  const who = input.conversation.customerName ?? "Customer";
  const channel = input.conversation.channel || "chat";
  const userPrompt = `Customer: ${who}\nChannel: ${channel}\n\nCustomer messages:\n${text}`;

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
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
      }),
    });
  } catch {
    return null;
  } finally {
    clear();
  }

  if (!response.ok) return null;

  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = (await response.json()) as typeof payload;
  } catch {
    return null;
  }

  const content = payload.choices?.[0]?.message?.content;
  if (!content) return null;

  try {
    return parseClassification(JSON.parse(content));
  } catch {
    return null;
  }
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

  const groundedQuotes = classification.quotes
    .filter((q) => quoteIsGrounded(q, sourceText))
    .map((q) => `quote: "${clipQuote(q)}"`);

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
    suggestedAction: pickAction(classification.type, score, overrides),
    evidence,
    status: "new",
    createdAt: new Date().toISOString(),
    groundTruth: conversation.groundTruth,
  };
}

/**
 * Add LLM signals only for conversations heuristics did not fire on.
 * Does not replace or rewrite heuristic signals (precision gate).
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

  const maxCalls = Math.max(
    0,
    options?.maxCalls ??
      positiveEnvNumber(process.env.DETECT_LLM_MAX_CALLS, DETECT_LLM_MAX_CALLS)
  );
  const selected = candidates.slice(0, maxCalls);
  const skipped = Math.max(0, candidates.length - selected.length);
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
    } catch {
      failed += 1;
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
