import { primaryQuote } from "./format";
import type { SignalType } from "./types";

/** Keep reply drafts short enough to paste into WhatsApp / Intercom. */
const MAX_REPLY_QUOTE_CHARS = 120;

function clipReplyQuote(quote: string): string {
  const trimmed = quote.trim();
  if (trimmed.length <= MAX_REPLY_QUOTE_CHARS) return trimmed;
  return `${trimmed.slice(0, MAX_REPLY_QUOTE_CHARS - 1).trimEnd()}…`;
}

function greetingName(customerName: string | null | undefined): string {
  const who = (customerName ?? "").trim();
  return who || "there";
}

export type CustomerReplyDraftInput = {
  type: SignalType;
  customerName?: string | null;
  evidence?: string[];
};

/**
 * Customer-facing reply draft (display-only; never sent).
 * Requires a Why This Fired quote; otherwise returns "" so callers can
 * fall back to taxonomy `pickAction`.
 */
export function composeCustomerReplyDraft(
  input: CustomerReplyDraftInput,
): string {
  const rawQuote = primaryQuote(input.evidence ?? []);
  if (!rawQuote) return "";
  const name = greetingName(input.customerName);
  const quote = clipReplyQuote(rawQuote);

  if (input.type === "retention") {
    return `Hi ${name}, I noticed you said “${quote}”. I’d like to help — is there a good time to connect today?`;
  }
  if (input.type === "lead") {
    return `Hi ${name}, thanks for reaching out — you mentioned “${quote}”. Happy to share the right plan details whenever you’re ready.`;
  }
  return `Hi ${name}, following up on “${quote}” — I can share eligibility and next steps if that would help.`;
}

/**
 * Suggested Next Action / clipboard string: grounded draft, else fallback
 * (taxonomy `pickAction` or stored `signal.suggestedAction`).
 */
export function resolveSuggestedAction(
  input: CustomerReplyDraftInput & { fallback?: string },
): string {
  return composeCustomerReplyDraft(input) || (input.fallback?.trim() ?? "");
}
