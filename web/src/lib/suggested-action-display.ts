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

export type ReplyLanguage = "hindi" | "hinglish" | "english";

const HINGLISH_RE =
  /\b(hai|hoon|hain|raha|rahi|rahe|nahi|nahin|paisa|bhai|mein|mera|meri|kya|aap|kar raha|kar rahi)\b/i;

/** Match the customer's own wording. English when the quote is English. */
export function detectReplyLanguage(text: string): ReplyLanguage {
  if (/[\u0900-\u097F]/.test(text)) return "hindi";
  if (HINGLISH_RE.test(text)) return "hinglish";
  return "english";
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
 *
 * Retention copy is RM/WhatsApp-ready: acknowledge the risk, offer a
 * same-day callback — partners paste this outside Sioona.
 */
export function composeCustomerReplyDraft(
  input: CustomerReplyDraftInput,
): string {
  const rawQuote = primaryQuote(input.evidence ?? []);
  if (!rawQuote) return "";
  const name = greetingName(input.customerName);
  const quote = clipReplyQuote(rawQuote);
  const language = detectReplyLanguage(quote);

  if (language === "hindi") {
    if (input.type === "retention") {
      return `नमस्ते ${name} — आपने लिखा “${quote}”. मैं इसे देख लेता हूँ और आज कॉल कर सकता हूँ. बात कब हो सकती है?`;
    }
    if (input.type === "lead") {
      return `नमस्ते ${name}, “${quote}” के बारे में धन्यवाद. जब समय हो, सही प्लान और आगे के कदम बता सकता हूँ.`;
    }
    return `नमस्ते ${name}, “${quote}” पर फॉलो-अप. अगर चाहें तो योग्यता और आगे के कदम देख लेता हूँ.`;
  }
  if (language === "hinglish") {
    if (input.type === "retention") {
      return `Hi ${name} — aapne likha “${quote}”. Main isko dekh leta hoon aur aaj call kar sakta hoon. Kab baat ho sakti hai?`;
    }
    if (input.type === "lead") {
      return `Hi ${name}, “${quote}” ke baare mein thanks. Jab time ho, sahi plan aur next steps bata sakta hoon.`;
    }
    return `Hi ${name}, “${quote}” par follow-up. Chahein to eligibility aur next steps dekh leta hoon.`;
  }

  if (input.type === "retention") {
    return `Hi ${name} — I saw your note about “${quote}”. I can look into this and call you today if helpful. When works for a quick chat?`;
  }
  if (input.type === "lead") {
    return `Hi ${name}, thanks for asking about “${quote}”. I can walk you through the right plan and next steps whenever you’re free.`;
  }
  return `Hi ${name}, following up on “${quote}” — happy to check eligibility and share next steps if useful.`;
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
