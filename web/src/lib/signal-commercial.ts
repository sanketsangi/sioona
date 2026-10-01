/**
 * Urgency and mentioned rupee value for a signal.
 * Independent of the revenue-leak report so either feature can be reverted.
 */

import type { Signal } from "@/lib/types";

export type SignalUrgency = "high" | "medium" | "low";

export interface SignalCommercial {
  urgency: SignalUrgency;
  urgencyTimeframe?: string;
  mentionedValueInr?: number;
}

const HIGH_RE =
  /\b(today|aaj|abhi|immediately|right now|this week|is hafte|closing|close my|leaving|nikal|shift|withdraw|paisa nikal)\b/i;
const MEDIUM_RE =
  /\b(this month|is mahine|thinking of|considering|not happy|delay|delayed|frustrated)\b/i;

const TIMEFRAMES: { re: RegExp; label: string }[] = [
  { re: /\b(today|aaj|abhi|immediately|right now)\b/i, label: "Today" },
  { re: /\b(this week|is hafte|kal)\b/i, label: "This week" },
  { re: /\b(this month|is mahine)\b/i, label: "This month" },
];

function parseToken(raw: string): number | null {
  const n = Number(raw.replace(/,/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export function extractMentionedInr(text: string): number | undefined {
  const amounts: number[] = [];
  for (const match of text.matchAll(
    /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:crore|crores|\bcr\b)/gi
  )) {
    const n = parseToken(match[1] ?? "");
    if (n != null) amounts.push(Math.round(n * 10_000_000));
  }
  for (const match of text.matchAll(
    /(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(?:lakh|lakhs|lac|lacs)\b/gi
  )) {
    const n = parseToken(match[1] ?? "");
    if (n != null) amounts.push(Math.round(n * 100_000));
  }
  for (const match of text.matchAll(
    /(?:₹|\brs\.?|\binr)\s*(\d[\d,]*(?:\.\d+)?)/gi
  )) {
    const n = parseToken(match[1] ?? "");
    if (n != null) amounts.push(Math.round(n));
  }
  if (amounts.length === 0) return undefined;
  return Math.max(...amounts);
}

export function inferSignalCommercial(text: string): SignalCommercial {
  const timeframe = TIMEFRAMES.find((rule) => rule.re.test(text))?.label;
  let urgency: SignalUrgency = "low";
  if (HIGH_RE.test(text) || timeframe === "Today" || timeframe === "This week") {
    urgency = "high";
  } else if (MEDIUM_RE.test(text) || timeframe === "This month") {
    urgency = "medium";
  }
  const mentionedValueInr = extractMentionedInr(text);
  return {
    urgency,
    ...(timeframe ? { urgencyTimeframe: timeframe } : {}),
    ...(mentionedValueInr != null ? { mentionedValueInr } : {}),
  };
}

export function attachSignalCommercial<T extends Signal>(
  signal: T,
  text: string
): T {
  return { ...signal, ...inferSignalCommercial(text) };
}

export function urgencyWeight(level: SignalUrgency | undefined): number {
  if (level === "high") return 3;
  if (level === "medium") return 2;
  return 1;
}

/** Higher means call sooner. Missing fields rank as low urgency and no value. */
export const TOP_CALLS_TODAY = 10;

export function topCallsToday<T extends Pick<Signal, "urgency" | "mentionedValueInr">>(
  signals: T[],
): T[] {
  return [...signals]
    .sort((a, b) => signalCallRank(b) - signalCallRank(a))
    .slice(0, TOP_CALLS_TODAY);
}

export function signalCallRank(signal: Pick<Signal, "urgency" | "mentionedValueInr">): number {
  const weight = urgencyWeight(signal.urgency);
  return weight * (signal.mentionedValueInr ?? 0) + weight;
}

export function formatMentionedInr(value: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);
}

export function signalCommercialLabel(signal: Pick<
  Signal,
  "urgency" | "urgencyTimeframe" | "mentionedValueInr"
>): string | null {
  if (!signal.urgency && signal.mentionedValueInr == null) return null;
  const parts: string[] = [signal.urgency ?? "low"];
  if (signal.urgencyTimeframe) parts.push(signal.urgencyTimeframe);
  if (signal.mentionedValueInr != null) {
    parts.push(formatMentionedInr(signal.mentionedValueInr));
  }
  return parts.join(" · ");
}
