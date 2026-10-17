/**
 * One-page revenue leak report for a Shadow Mode pilot.
 * Derived from existing signals. Outcomes are reviewer records only.
 * Nothing is sent to a customer.
 */

import type {
  Conversation,
  Message,
  Signal,
  SignalOutcome,
} from "@/lib/types";

export type UrgencyLevel = "high" | "medium" | "low";

export interface InferredCommercial {
  urgency: UrgencyLevel;
  timeframe: string | null;
  valueInr: number | null;
}

/** Saved / Lost / Converted on the report. Stored as retained / churned / converted. */
export type ReportOutcome = "saved" | "lost" | "converted";

export function reportOutcome(outcome: SignalOutcome | null | undefined): ReportOutcome | null {
  if (outcome === "retained") return "saved";
  if (outcome === "churned") return "lost";
  if (outcome === "converted") return "converted";
  return null;
}

export function storedOutcome(outcome: ReportOutcome): SignalOutcome {
  if (outcome === "saved") return "retained";
  if (outcome === "lost") return "churned";
  return "converted";
}

export type CommercialValueCategory = "asset" | "revenue_opportunity" | "unconfirmed" | "reviewer_recorded";

export interface AtRiskCustomer {
  historical?: boolean;
  signalId: string;
  backendSignalId?: string;
  conversationId: string;
  /** Pseudonym, or the stored name when the report is revealed. */
  customerLabel: string;
  quote: string;
  urgency: UrgencyLevel;
  timeframe: string | null;
  valueInr: number | null;
  outcome: ReportOutcome | null;
  valueProvenance?: string;
  valueCategory?: CommercialValueCategory;
  valueMessageIds?: string[];
}

export interface RevenueLeakReport {
  dataLabel?: string;
  reviewsAvailable?: boolean;
  revenueVerified?: boolean;
  windowLabel: string;
  fileLabel: string | null;
  anonymised: boolean;
  counts: { retention: number; lead: number; upsell: number };
  customersAtRisk: AtRiskCustomer[];
  outcomes: { saved: number; lost: number; converted: number };
  inrAtRisk: number;
  exposure: { assetInr: number; revenueOpportunityInr: number; unconfirmedInr: number; reviewerRecordedInr: number };
  inrSaved: number;
  precision: {
    reviewed: number;
    correct: number;
    /**
     * `correct / reviewed`, including partially correct reviews in the denominator.
     * Null only when there are no reviews.
     */
    score: number | null;
  };
}

const HIGH_RE =
  /\b(today|aaj|abhi|immediately|right now|this week|is hafte|closing|close my|leaving|leave|nikal|shift|withdraw|paisa nikal|moving my|switch(?:ing)? to)\b/i;
const MEDIUM_RE =
  /\b(this month|is mahine|thinking of|considering|not happy|unhappy|delay|delayed|complaint|fed up|frustrated)\b/i;

const TIMEFRAME_RULES: { re: RegExp; label: string }[] = [
  { re: /\b(today|aaj|abhi|right now|immediately|this morning)\b/i, label: "Today" },
  { re: /\b(this week|is hafte|by friday|by monday|kal)\b/i, label: "This week" },
  { re: /\b(this month|is mahine)\b/i, label: "This month" },
];

function collapse(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/** Stable pseudonym. Same conversation id always maps to the same label. */
export function pseudonymFor(conversationId: string): string {
  let hash = 2166136261;
  for (let i = 0; i < conversationId.length; i++) {
    hash ^= conversationId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const n = (hash >>> 0) % 10000;
  return `C-${n.toString(16).toUpperCase().padStart(4, "0")}`;
}

function parseAmountToken(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

/** Largest rupee, lakh, or crore amount stated in the text. */
export function extractMentionedInr(text: string): number | null {
  const amounts: number[] = [];
  const crore =
    /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:crore|crores|\bcr\b)/gi;
  const lakh = /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b/gi;
  const rupee = /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)/gi;
  for (const match of text.matchAll(crore)) {
    const n = parseAmountToken(match[1] ?? "");
    if (n != null) amounts.push(Math.round(n * 10_000_000));
  }
  for (const match of text.matchAll(lakh)) {
    const n = parseAmountToken(match[1] ?? "");
    if (n != null) amounts.push(Math.round(n * 100_000));
  }
  for (const match of text.matchAll(rupee)) {
    const n = parseAmountToken(match[1] ?? "");
    if (n != null) amounts.push(Math.round(n));
  }
  if (amounts.length === 0) return null;
  return Math.max(...amounts);
}

export function commercialValueCategory(text: string, recorded: boolean): CommercialValueCategory {
  if (recorded) return "reviewer_recorded";
  const asset = /\b(portfolio|holdings|assets?|aum|corpus|account balance)\b/i.test(text);
  const revenue = /\b(fees?|brokerage|commission|revenue|subscription|premium)\b/i.test(text);
  if (asset && !revenue) return "asset";
  if (revenue && !asset) return "revenue_opportunity";
  return "unconfirmed";
}

export function commercialValueProvenance(text: string, recorded: boolean): string {
  return { asset: "Text-derived asset value", revenue_opportunity: "Text-derived revenue opportunity",
    unconfirmed: "Text-derived value; category unconfirmed", reviewer_recorded: "Reviewer-recorded value" }[commercialValueCategory(text, recorded)];
}

export function inferCommercial(text: string): InferredCommercial {
  const timeframe =
    TIMEFRAME_RULES.find((rule) => rule.re.test(text))?.label ?? null;
  let urgency: UrgencyLevel = "low";
  if (HIGH_RE.test(text) || timeframe === "Today" || timeframe === "This week") {
    urgency = "high";
  } else if (MEDIUM_RE.test(text) || timeframe === "This month") {
    urgency = "medium";
  }
  return {
    urgency,
    timeframe,
    valueInr: extractMentionedInr(text),
  };
}

export function formatInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

/** ASCII rupee label for PDF text that cannot embed ₹. */
export function formatInrAscii(value: number): string {
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(value);
  return `INR ${formatted}`;
}

function clipQuote(text: string): string {
  const clean = collapse(text);
  if (clean.length <= 220) return clean;
  return `${clean.slice(0, 219).trimEnd()}…`;
}

function groundedCustomerQuote(conversationId: string, messages: Message[], evidence: string[]): string {
  const turns = messages.filter((message) => message.conversationId === conversationId && message.role === "customer");
  for (const entry of evidence) {
    const quote = entry.match(/^quote: "([\s\S]*)"$/)?.[1] ?? entry;
    const normalized = collapse(quote);
    if (normalized && turns.some((turn) => collapse(turn.content).includes(normalized))) return clipQuote(quote);
  }
  return "";
}

function customerBlob(
  conversationId: string,
  messages: Message[],
): string {
  const said = messages
    .filter((m) => m.conversationId === conversationId && m.role === "customer")
    .map((m) => m.content);
  return said.join("\n");
}

function urgencyWeight(level: UrgencyLevel): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

export function rankUrgencyValue(
  urgency: UrgencyLevel,
  valueInr: number | null
): number {
  return urgencyWeight(urgency) * (valueInr ?? 0) + urgencyWeight(urgency);
}

export function buildRevenueLeakReport(input: {
  signals: Signal[];
  conversations: Conversation[];
  messages: Message[];
  windowLabel: string;
  fileLabel?: string | null;
  anonymised?: boolean;
  reviewed?: number;
  correct?: number;
  incorrect?: number;
}): RevenueLeakReport {
  const anonymised = input.anonymised !== false;
  const conversations = new Map(
    input.conversations.map((c) => [c.id, c])
  );

  const counts = { retention: 0, lead: 0, upsell: 0 };
  const outcomeCounts = { saved: 0, lost: 0, converted: 0 };
  for (const signal of input.signals) {
    if (signal.type === "retention") counts.retention += 1;
    else if (signal.type === "lead") counts.lead += 1;
    else if (signal.type === "upsell") counts.upsell += 1;
    const bucket = reportOutcome(signal.outcome?.outcome);
    if (bucket) outcomeCounts[bucket] += 1;
  }

  const retentionByConversation = new Map<string, Signal>();
  for (const signal of input.signals) {
    if (signal.type !== "retention") continue;
    const existing = retentionByConversation.get(signal.conversationId);
    if (!existing || signal.confidence > existing.confidence) {
      retentionByConversation.set(signal.conversationId, signal);
    }
  }

  const customersAtRisk: AtRiskCustomer[] = [];
  for (const signal of retentionByConversation.values()) {
    const conversation = conversations.get(signal.conversationId);
    const blob = customerBlob(
      signal.conversationId,
      input.messages
    );
    const commercial = inferCommercial(`${signal.summary}\n${blob}`);
    const recorded = signal.outcome?.valueInr;
    const stated = input.messages.filter((message) => message.conversationId === signal.conversationId && message.role === "customer")
      .map((message) => ({ message, amount: extractMentionedInr(message.content) }))
      .filter((row) => row.amount != null);
    const amount = stated.length ? Math.max(...stated.map((row) => row.amount!)) : null;
    const durable = (signal.commercialValueEvidence ?? []).filter((entry) =>
      entry.amountInr === signal.mentionedValueInr && Number.isSafeInteger(entry.amountInr) && entry.amountInr >= 0 && entry.quote && entry.messageId);
    const valueInr = recorded ?? (durable.length ? signal.mentionedValueInr ?? null : amount);
    const durableCategories = new Set(durable.map((entry) => entry.category));
    const valueCategory: CommercialValueCategory = recorded != null ? "reviewer_recorded" : durable.length
      ? durableCategories.size === 1 ? durable[0].category : "unconfirmed"
      : commercialValueCategory(stated.filter((row) => row.amount === amount).map((row) => row.message.content).join("\n"), false);
    const amountTurns = stated.filter((row) => row.amount === amount);
    const amountText = amountTurns.map((row) => row.message.content).join("\n");
    const name = conversation?.customerName?.trim();
    customersAtRisk.push({
      signalId: signal.id,
      historical: signal.historical,
      ...(signal.backendSignalId ? { backendSignalId: signal.backendSignalId } : {}),
      conversationId: signal.conversationId,
      customerLabel:
        anonymised || !name ? pseudonymFor(signal.conversationId) : name,
      quote: groundedCustomerQuote(signal.conversationId, input.messages, signal.evidence),
      urgency: commercial.urgency,
      timeframe: commercial.timeframe,
      valueInr,
      valueMessageIds: recorded == null ? durable.length ? durable.map((entry) => entry.messageId) : amountTurns.map((row) => row.message.id) : undefined,
      valueCategory: valueInr == null ? undefined : valueCategory,
      valueProvenance: valueInr == null ? undefined : durable.length && recorded == null
        ? { asset: "Customer-grounded asset value", revenue_opportunity: "Customer-grounded revenue opportunity", unconfirmed: "Customer-grounded value; category unconfirmed", reviewer_recorded: "Reviewer-recorded value" }[valueCategory]
        : commercialValueProvenance(amountText, recorded != null),
      outcome: reportOutcome(signal.outcome?.outcome),
    });
  }

  customersAtRisk.sort(
    (a, b) =>
      rankUrgencyValue(b.urgency, b.valueInr) -
      rankUrgencyValue(a.urgency, a.valueInr)
  );

  const exposure = { assetInr: 0, revenueOpportunityInr: 0, unconfirmedInr: 0, reviewerRecordedInr: 0 };
  let inrAtRisk = 0;
  let inrSaved = 0;
  for (const row of customersAtRisk) {
    if (row.valueInr == null || row.outcome === "converted") continue;
    inrAtRisk += row.valueInr;
    const key = { asset: "assetInr", revenue_opportunity: "revenueOpportunityInr",
      unconfirmed: "unconfirmedInr", reviewer_recorded: "reviewerRecordedInr" }[row.valueCategory ?? "unconfirmed"] as keyof typeof exposure;
    exposure[key] += row.valueInr;
  }

  for (const signal of input.signals) {
    if (["retained", "converted"].includes(signal.outcome?.outcome ?? "")) inrSaved += signal.outcome?.valueInr ?? 0;
  }

  const reviewed = input.reviewed ?? 0;
  const correct = input.correct ?? 0;
  return {
    windowLabel: input.windowLabel,
    fileLabel: input.fileLabel ?? null,
    anonymised,
    counts,
    customersAtRisk,
    outcomes: outcomeCounts,
    inrAtRisk,
    exposure,
    inrSaved,
    precision: {
      reviewed,
      correct,
      score: reviewed > 0 ? correct / reviewed : null,
    },
  };
}

export function precisionLabel(score: number | null, reviewed: number): string {
  if (reviewed <= 0 || score == null) return "Insufficient data";
  return `${Math.round(score * 100)}% (${reviewed} reviewed)`;
}
