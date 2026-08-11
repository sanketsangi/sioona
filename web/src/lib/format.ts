import type { Signal, SignalType } from "./types";

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

/**
 * Pending until the operator leaves feedback.
 * Feedback label is the StatusDot source of truth once present (not `status===new`).
 * URL filter `status=new` remains the Neon needs-review bucket.
 */
export function isSignalNeedsReview(
  signal: Pick<Signal, "status" | "feedback">
): boolean {
  return !signal.feedback;
}

/** geistcn StatusDot states used for Insights review chrome. */
export type SignalStatusDotState =
  | "QUEUED"
  | "BUILDING"
  | "ERROR"
  | "READY"
  | "CANCELED";

/**
 * Map signal review/feedback → StatusDot state + visible label.
 * Pending (no feedback) → Needs Review / blue QUEUED.
 * Correct → green READY | Incorrect → red ERROR | Partially Correct → orange BUILDING.
 */
export function signalStatusDot(
  signal: Pick<Signal, "status" | "feedback">
): { state: SignalStatusDotState; label: string } {
  const label = signal.feedback?.label;
  if (!label) {
    return { state: "QUEUED", label: "Needs Review" };
  }
  switch (label) {
    case "correct":
      return { state: "READY", label: "Correct" };
    case "incorrect":
      return { state: "ERROR", label: "Incorrect" };
    case "partially_correct":
      return { state: "BUILDING", label: "Partially Correct" };
    default:
      return { state: "CANCELED", label: "Reviewed" };
  }
}

/** Operator-facing review status for queue + preview (outcome label only). */
export function signalReviewStatusLabel(
  signal: Pick<Signal, "status" | "feedback">
): string {
  return signalStatusDot(signal).label;
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

/**
 * Derive display name from corpus-style externalIds like `rahul_mehta_29` → `Rahul Mehta`.
 * Returns null when the id is not a name_tokens + numeric suffix pattern.
 */
export function customerNameFromExternalId(
  externalId: string | undefined | null
): string | null {
  const id = typeof externalId === "string" ? externalId.trim() : "";
  if (!id) return null;
  const match = id.match(/^([a-z]+(?:_[a-z]+)*)_(\d+)$/i);
  if (!match) return null;
  return match[1]
    .split("_")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

/**
 * Up to 2 uppercase initials from a display name.
 * Ignores punctuation; missing/empty → "?".
 * e.g. "Neha Singh" → "NS", "Neha" → "N".
 */
export function initialsFromName(name?: string): string {
  if (!name) return "?";
  const parts = name
    .trim()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    return parts[0].charAt(0).toUpperCase();
  }
  return (
    parts[0].charAt(0) + parts[parts.length - 1].charAt(0)
  ).toUpperCase();
}
