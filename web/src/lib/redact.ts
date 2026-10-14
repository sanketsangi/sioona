import { createHash } from "node:crypto";

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
  upi: "[upi]",
  ifsc: "[ifsc]",
  clientCode: "[broker-id]",
  dob: "[dob]",
  address: "[address]",
  pin: "[pin]",
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
 * UPI VPAs on known PSPs only. No dotted domains, so this does not eat emails.
 * Examples: name@okaxis, user@ybl, shop@paytm.
 */
const UPI_RE =
  /(?<![A-Za-z0-9.])[A-Za-z][A-Za-z0-9._-]{1,40}@(?:okaxis|okhdfcbank|okicici|oksbi|ybl|paytm|upi|ibl|axl|apl|fbl)\b/gi;

/** IFSC: 4 letters, a 0, then 6 alphanumerics (HDFC0001234). */
const IFSC_RE = /\b[A-Z]{4}0[A-Z0-9]{6}\b/g;

/** Labeled broker ids: "client code AB123456", "UCC: ZX998877". */
const LABELED_CLIENT_RE =
  /\b(?:client(?:\s+(?:id|code))?|ucc|bo\s*id|dp\s*id)\s*[:#-]?\s*[A-Za-z0-9]{4,16}\b/gi;

/**
 * Standalone uppercase client codes with 6+ trailing digits (AB123456).
 * Six digits keeps SIP amounts and short ticket numbers readable.
 */
const CLIENT_CODE_RE = /\b[A-Z]{2,4}\d{6,10}\b/g;

/** Labeled dates of birth only — ordinary trade dates stay in the quote. */
const DOB_RE =
  /\b(?:d\.?o\.?b\.?|date of birth|born on)\s*[:\-]?\s*\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/gi;

/** Labeled address lines. Bare city names are left alone. */
const ADDRESS_RE = /\b(?:address|addr)\s*:\s*[^\n]{6,160}/gi;

/** Labeled PIN codes. A bare 6-digit number is not enough. */
const PIN_RE = /\b(?:pin(?:\s*code)?|pincode)\s*[:\-]?\s*\d{6}\b/gi;

/**
 * Redact PII from a single string. Order matters: structured patterns
 * (email, PAN, spaced Aadhaar, phone) run before the greedy long-number
 * fallback so identifiers get their most specific label.
 */
export function redactText(input: string): string {
  if (!input) return input;
  return input
    .replace(EMAIL_RE, REDACTION_TOKENS.email)
    .replace(UPI_RE, REDACTION_TOKENS.upi)
    .replace(PAN_RE, REDACTION_TOKENS.pan)
    .replace(IFSC_RE, REDACTION_TOKENS.ifsc)
    .replace(AADHAAR_SPACED_RE, REDACTION_TOKENS.aadhaar)
    .replace(PHONE_RE, REDACTION_TOKENS.phone)
    .replace(AADHAAR_COMPACT_RE, REDACTION_TOKENS.aadhaar)
    .replace(ACCOUNT_RE, REDACTION_TOKENS.account)
    .replace(LABELED_CLIENT_RE, REDACTION_TOKENS.clientCode)
    .replace(CLIENT_CODE_RE, REDACTION_TOKENS.clientCode)
    .replace(DOB_RE, REDACTION_TOKENS.dob)
    .replace(ADDRESS_RE, REDACTION_TOKENS.address)
    .replace(PIN_RE, REDACTION_TOKENS.pin);
}

const PSEUDONYM_RE = /^Customer [0-9a-f]{8}$/i;

function normalizeIdentity(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, " ");
}

function identityKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length >= 10 && digits.length <= 15) {
    return `phone:${digits.slice(-10)}`;
  }
  return normalizeIdentity(raw);
}

function shortHash(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 8);
}

/**
 * Stable pseudonym for a customer label. Phone-like names hash the last
 * 10 digits so `+91 98765 43210` and `9876543210` share one id.
 * Already-pseudonym strings pass through.
 */
export function pseudonymCustomerName(
  name: string | null | undefined,
): string | undefined {
  const raw = name?.trim();
  if (!raw) return undefined;
  if (PSEUDONYM_RE.test(raw)) return raw;
  return `Customer ${shortHash(`sioona-customer:${identityKey(raw)}`)}`;
}

/** Drop a raw name; short labels match whole Unicode words to avoid corrupting text. */
export function scrubCustomerName(
  content: string,
  rawName: string | null | undefined,
): string {
  const name = rawName?.trim();
  if (!name || !content) return content;
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = name.length < 4 ? `(?<![\\p{L}\\p{M}\\p{N}])${escaped}(?![\\p{L}\\p{M}\\p{N}])` : escaped;
  return content.replace(new RegExp(pattern, "giu"), "[name]");
}

/**
 * External ids that are phones, other PII, or the raw sender name become
 * `ext_<hash>`. Ordinary export ids (`wa-reupload-1`) stay readable.
 */
export function safeExternalId(
  externalId: string | null | undefined,
  rawName?: string | null,
): string | undefined {
  const trimmed = externalId?.trim();
  if (!trimmed) return undefined;
  const digits = trimmed.replace(/\D/g, "");
  const phoneLike = digits.length >= 10 && digits.length <= 15;
  const nameMatch =
    Boolean(rawName?.trim()) &&
    normalizeIdentity(trimmed) === normalizeIdentity(rawName!.trim());
  if (phoneLike || nameMatch || containsPii(trimmed)) {
    return `ext_${shortHash(`sioona-external:${identityKey(trimmed)}`)}`;
  }
  return trimmed;
}

/** True when the text contains at least one PII pattern we redact. */
export function containsPii(input: string): boolean {
  if (!input) return false;
  return redactText(input) !== input;
}
