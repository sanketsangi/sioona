import { getEffectiveTaxonomy, getTaxonomy } from "./taxonomy";
import type {
  Conversation,
  Message,
  Signal,
  SignalType,
  TaxonomyOverrides,
} from "./types";

/** Minimum heuristic score to emit a Shadow Mode signal. */
export const SCORE_THRESHOLD = 0.35;
const PHRASE_WEIGHT = 2.5;
const KEYWORD_WEIGHT = 1;
/** Weak/ambiguous tokens need more co-evidence. */
const WEAK_KEYWORDS = new Set([
  "interested",
  "price",
  "pricing",
  "invest",
  "purchase",
  "how much",
  "brokerage",
  "cancel",
  "closing",
  "refund",
  "premium",
  "upgrade",
  "insurance",
  "charges",
  "join",
  "options",
  "kyc",
  "unhappy",
  "worst",
  "useless",
  "closure",
  "wallet",
  "upi",
  "competitor",
]);
const WEAK_KEYWORD_WEIGHT = 0.5;
const HIT_NORMALIZE = 6;
/** Keyword-only scores need ≥2 distinct keyword hits (phrases may still fire alone). */
const MIN_KEYWORD_ONLY_HITS = 2;
const QUOTE_MAX = 140;

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Multi-word phrases are substrings; single tokens use word boundaries. */
export function textIncludesTerm(text: string, term: string): boolean {
  const needle = normalize(term);
  if (!needle) return false;
  if (needle.includes(" ")) {
    return text.includes(needle);
  }
  const re = new RegExp(
    `(?:^|[^a-z0-9])${escapeRegex(needle)}(?:[^a-z0-9]|$)`,
    "i"
  );
  return re.test(text);
}

function clipQuote(text: string, max = QUOTE_MAX): string {
  const cleaned = text.replace(/\s+/g, " ").trim();
  if (cleaned.length <= max) return cleaned;
  return `${cleaned.slice(0, max - 1).trimEnd()}…`;
}

/** Customer utterance that contains the matched term — for display evidence. */
export function findCustomerQuote(
  messages: Message[],
  term: string
): string | null {
  for (const message of messages) {
    if (message.role !== "customer") continue;
    if (textIncludesTerm(normalize(message.content), term)) {
      return clipQuote(message.content);
    }
  }
  return null;
}

export function scoreType(
  text: string,
  type: SignalType,
  overrides?: TaxonomyOverrides | null
): { score: number; evidence: string[]; suppressed: boolean } {
  const entry = getTaxonomy(type, overrides);
  const normalized = normalize(text);

  for (const negative of entry.negativePhrases) {
    if (textIncludesTerm(normalized, negative)) {
      return {
        score: 0,
        evidence: [`suppressed: "${negative}"`],
        suppressed: true,
      };
    }
  }

  const evidence = new Set<string>();
  let hits = 0;
  let phraseHits = 0;
  let keywordHits = 0;

  for (const phrase of entry.phrases) {
    if (textIncludesTerm(normalized, phrase)) {
      hits += PHRASE_WEIGHT;
      phraseHits += 1;
      evidence.add(`phrase: "${phrase}"`);
    }
  }

  for (const keyword of entry.keywords) {
    if (textIncludesTerm(normalized, keyword)) {
      const weight = WEAK_KEYWORDS.has(normalize(keyword))
        ? WEAK_KEYWORD_WEIGHT
        : KEYWORD_WEIGHT;
      hits += weight;
      keywordHits += 1;
      evidence.add(`keyword: "${keyword}"`);
    }
  }

  // Lone product tokens must not light Shadow Mode without a phrase or co-evidence.
  if (phraseHits === 0 && keywordHits < MIN_KEYWORD_ONLY_HITS) {
    return { score: 0, evidence: [...evidence].slice(0, 6), suppressed: false };
  }

  const score = Math.min(1, hits / HIT_NORMALIZE);
  return { score, evidence: [...evidence].slice(0, 6), suppressed: false };
}

/**
 * Prefer customer quotes, then match labels — max 5 items for Shadow Mode UI.
 */
export function enrichEvidence(
  matchEvidence: string[],
  customerMessages: Message[]
): string[] {
  const quotes: string[] = [];
  const matches: string[] = [];

  for (const item of matchEvidence) {
    if (item.startsWith("suppressed:")) {
      matches.push(item);
      continue;
    }
    const termMatch = item.match(/^(?:phrase|keyword): "([^"]+)"$/);
    if (termMatch?.[1]) {
      const quote = findCustomerQuote(customerMessages, termMatch[1]);
      if (quote) {
        const entry = `quote: "${quote}"`;
        if (!quotes.includes(entry)) quotes.push(entry);
      }
    }
    matches.push(item);
  }

  return [...quotes.slice(0, 2), ...matches.slice(0, 3)].slice(0, 5);
}

export function pickAction(
  type: SignalType,
  score: number,
  overrides?: TaxonomyOverrides | null
): string {
  const actions = getTaxonomy(type, overrides).suggestedActions;
  if (score >= 0.75) return actions[0];
  if (score >= 0.5) return actions[1] ?? actions[0];
  return actions[actions.length - 1] ?? actions[0];
}

/** Narrative-only; evidence quotes live on `signal.evidence` (Why This Fired). */
function buildSummary(
  type: SignalType,
  conversation: Conversation,
  score: number
): string {
  const who = conversation.customerName ?? "Customer";
  const via = conversation.channel ? ` (${conversation.channel})` : "";

  if (type === "lead") {
    if (score >= 0.75) {
      return `${who}${via} shows strong buying intent. Prioritize outreach.`;
    }
    if (score >= 0.5) {
      return `${who}${via} is exploring products or pricing — follow up soon.`;
    }
    return `${who}${via} may be an early lead — worth a light touch.`;
  }

  if (type === "retention") {
    if (score >= 0.75) {
      return `${who}${via} is at high churn risk — intervene today.`;
    }
    if (score >= 0.5) {
      return `${who}${via} shows frustration — run retention playbook.`;
    }
    return `${who}${via} may be drifting — check in before they leave.`;
  }

  // upsell
  if (score >= 0.75) {
    return `${who}${via} is asking about an adjacent product — sales opportunity.`;
  }
  if (score >= 0.5) {
    return `${who}${via} may be open to a cross-sell — soft pitch.`;
  }
  return `${who}${via} hinted at another product — watch for upsell.`;
}

export function detectSignalsForConversation(
  conversation: Conversation,
  messages: Message[],
  tenantId: string,
  overrides?: TaxonomyOverrides | null
): Signal[] {
  const customerMessages = messages.filter((m) => m.role === "customer");
  const customerText = normalize(
    customerMessages.map((m) => m.content).join("\n")
  );

  if (!customerText) return [];

  const taxonomy = getEffectiveTaxonomy(overrides);
  const ranked = taxonomy
    .map((entry) => {
      const { score, evidence: matchEvidence } = scoreType(
        customerText,
        entry.type,
        overrides
      );
      return {
        type: entry.type,
        score,
        evidence: enrichEvidence(matchEvidence, customerMessages),
      };
    })
    .filter((r) => r.score >= SCORE_THRESHOLD)
    .sort((a, b) => b.score - a.score);

  // Keep top signal per conversation for a clean Shadow Mode queue;
  // include a second if nearly tied and both meaningful.
  const selected = ranked.slice(0, 1);
  if (
    ranked[1] &&
    ranked[1].score >= 0.55 &&
    ranked[0].score - ranked[1].score < 0.15
  ) {
    selected.push(ranked[1]);
  }

  const now = new Date().toISOString();
  return selected.map((r, index) => ({
    id: `sig_${conversation.id}_${r.type}_${index}`,
    tenantId,
    conversationId: conversation.id,
    type: r.type,
    score: Number(r.score.toFixed(3)),
    confidence: Number(r.score.toFixed(3)),
    summary: buildSummary(r.type, conversation, r.score),
    suggestedAction: pickAction(r.type, r.score, overrides),
    evidence: r.evidence,
    status: "new" as const,
    createdAt: now,
    groundTruth: conversation.groundTruth,
  }));
}

function messagesByConversation(
  messages: Message[]
): Map<string, Message[]> {
  const byConversation = new Map<string, Message[]>();
  for (const message of messages) {
    const list = byConversation.get(message.conversationId) ?? [];
    list.push(message);
    byConversation.set(message.conversationId, list);
  }
  return byConversation;
}

export function runDetection(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  overrides?: TaxonomyOverrides | null
): Signal[] {
  const byConversation = messagesByConversation(messages);
  return conversations.flatMap((conversation) =>
    detectSignalsForConversation(
      conversation,
      byConversation.get(conversation.id) ?? [],
      tenantId,
      overrides
    )
  );
}

/** Same as runDetection, reporting real per-chat ticks (0 then 1…N). */
export async function runDetectionWithProgress(
  conversations: Conversation[],
  messages: Message[],
  tenantId: string,
  overrides: TaxonomyOverrides | null | undefined,
  onProgress: (done: number, total: number) => void | Promise<void>
): Promise<Signal[]> {
  const byConversation = messagesByConversation(messages);
  const total = conversations.length;
  await onProgress(0, total);
  const signals: Signal[] = [];
  for (let i = 0; i < conversations.length; i++) {
    const conversation = conversations[i];
    if (!conversation) continue;
    signals.push(
      ...detectSignalsForConversation(
        conversation,
        byConversation.get(conversation.id) ?? [],
        tenantId,
        overrides
      )
    );
    await onProgress(i + 1, total);
  }
  return signals;
}
