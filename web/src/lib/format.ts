import type { SignalType } from "./types";

const percentFormatter = new Intl.NumberFormat("en-US", {
  style: "percent",
  maximumFractionDigits: 0,
});

export function formatPercent(value: number | null): string {
  if (value === null || Number.isNaN(value)) return "—";
  return percentFormatter.format(value);
}

export function formatScore(score: number): string {
  return `${Math.round(score * 100)}`;
}

export function signalTypeLabel(type: SignalType): string {
  switch (type) {
    case "lead":
      return "Lead";
    case "retention":
      return "Retention";
    case "upsell":
      return "Upsell";
  }
}

export function signalTypeClass(type: SignalType): string {
  switch (type) {
    case "lead":
      return "bg-ds-blue-100 text-ds-blue-900 ring-ds-blue-700/40";
    case "retention":
      return "bg-ds-amber-100 text-ds-amber-900 ring-ds-amber-700/40";
    case "upsell":
      return "bg-ds-teal-100 text-ds-teal-900 ring-ds-teal-700/40";
  }
}

/** Quiet type mark fill for campaign-style queue rows (`sio-signal-*`). */
export function signalTypeMarkClass(type: SignalType): string {
  switch (type) {
    case "lead":
      return "bg-sio-signal-lead-bg text-sio-signal-lead-fg";
    case "retention":
      return "bg-sio-signal-retention-bg text-sio-signal-retention-fg";
    case "upsell":
      return "bg-sio-signal-upsell-bg text-sio-signal-upsell-fg";
  }
}

export function signalTypeInitial(type: SignalType): string {
  return signalTypeLabel(type).charAt(0);
}

/** Human-readable evidence line (quotes vs match labels). */
export function formatEvidenceItem(item: string): {
  kind: "quote" | "match" | "suppressed";
  text: string;
} {
  const quoteMatch = item.match(/^quote:\s*"(.+)"$/);
  if (quoteMatch) {
    return { kind: "quote", text: quoteMatch[1] };
  }
  const suppressedMatch = item.match(/^suppressed:\s*"(.+)"$/);
  if (suppressedMatch) {
    return { kind: "suppressed", text: `Suppressed · ${suppressedMatch[1]}` };
  }
  const match = item.match(/^(phrase|keyword):\s*"([^"]+)"$/);
  if (match) {
    return {
      kind: "match",
      text: `${match[1] === "phrase" ? "Phrase" : "Keyword"} · ${match[2]}`,
    };
  }
  return { kind: "match", text: item };
}

export function primaryQuote(evidence: string[]): string | null {
  for (const item of evidence) {
    const formatted = formatEvidenceItem(item);
    if (formatted.kind === "quote") return formatted.text;
  }
  return null;
}
