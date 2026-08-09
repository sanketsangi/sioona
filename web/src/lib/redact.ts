/**
 * Lightweight PII redaction for the ingest path (Phase 1 compliance).
 *
 * Masks the common identifiers found in Indian broking / wealth chats before
 * conversations are stored: email, phone, PAN, Aadhaar, and long account
 * numbers. Redaction is intentionally conservative and detection-safe — the
 * replacement tokens contain no taxonomy keywords or digits, so keyword /
 * phrase detection keeps working on redacted text.
 *
 * This is masking, not tokenized de-identification. It is defense-in-depth for
 * demo / pilot data hygiene, not a substitute for a real DLP pipeline.
 */

export const REDACTION_TOKENS = {
  email: "[email]",
  pan: "[pan]",
  aadhaar: "[aadhaar]",
  phone: "[phone]",
  account: "[account]",
} as const;

const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

/** Indian PAN: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F). */
const PAN_RE = /\b[A-Za-z]{5}[0-9]{4}[A-Za-z]\b/g;

/** Aadhaar written as 4-4-4 with space or hyphen separators. */
const AADHAAR_SPACED_RE = /(?<!\d)\d{4}[\s-]\d{4}[\s-]\d{4}(?!\d)/g;

/** Aadhaar written as a compact 12-digit run. */
const AADHAAR_COMPACT_RE = /(?<!\d)\d{12}(?!\d)/g;

/**
 * Indian mobile: optional +91 / 91 / 0 prefix then a 10-digit number starting
 * 6-9, allowing a single space/hyphen split (e.g. "98765 43210").
 */
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;

/** Remaining long digit runs (bank / trading account, client codes). */
const ACCOUNT_RE = /(?<!\d)\d{9,18}(?!\d)/g;

/**
 * Redact PII from a single string. Order matters: structured patterns
 * (email, PAN, spaced Aadhaar, phone) run before the greedy long-number
 * fallback so identifiers get their most specific label.
 */
export function redactText(input: string): string {
  if (!input) return input;
  return input
    .replace(EMAIL_RE, REDACTION_TOKENS.email)
    .replace(PAN_RE, REDACTION_TOKENS.pan)
    .replace(AADHAAR_SPACED_RE, REDACTION_TOKENS.aadhaar)
    .replace(PHONE_RE, REDACTION_TOKENS.phone)
    .replace(AADHAAR_COMPACT_RE, REDACTION_TOKENS.aadhaar)
    .replace(ACCOUNT_RE, REDACTION_TOKENS.account);
}

/** True when the text contains at least one PII pattern we redact. */
export function containsPii(input: string): boolean {
  if (!input) return false;
  return redactText(input) !== input;
}
