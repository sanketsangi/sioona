import { textIncludesTerm } from "./detect";
import type { Message, Signal } from "./types";

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** clipQuote uses a single unicode ellipsis when truncating. */
function stripClipEllipsis(text: string): string {
  return text.endsWith("…") ? text.slice(0, -1).trimEnd() : text;
}

/**
 * Search string for a Why This Fired item (quote stem, phrase, keyword,
 * or suppressed term). Null when the item has nothing to jump to.
 */
export function evidenceQuery(item: string): string | null {
  const quote = item.match(/^quote:\s*"(.+)"$/);
  if (quote?.[1]) return stripClipEllipsis(quote[1]);
  const term = item.match(/^(?:phrase|keyword|suppressed):\s*"(.+)"$/);
  if (term?.[1]) return term[1];
  return null;
}

function poolForEvidence(messages: Message[]): Message[] {
  const withText = messages.filter((message) => message.content.trim());
  const customers = withText.filter((message) => message.role === "customer");
  return customers.length > 0 ? customers : withText;
}

/**
 * Most recent customer (then any) message that contains this evidence item.
 * Quote stems match clipped `quote: "…"` entries from detect / overlay fill.
 */
export function messageIdForEvidence(
  item: string,
  messages: Message[],
): string | null {
  const query = evidenceQuery(item);
  if (!query) return null;
  const needle = normalize(query);
  if (!needle) return null;

  const pool = poolForEvidence(messages);
  for (let i = pool.length - 1; i >= 0; i--) {
    const message = pool[i];
    const content = normalize(message.content);
    if (content.includes(needle) || textIncludesTerm(content, query)) {
      return message.id;
    }
  }
  return null;
}

/** First evidence item that lands on a stored message — default highlight. */
export function firstEvidenceMessageId(
  evidence: string[],
  messages: Message[],
): string | null {
  for (const item of evidence) {
    const id = messageIdForEvidence(item, messages);
    if (id) return id;
  }
  return null;
}

/**
 * Default highlight. A server anchor uses its message id.
 * Stale or unresolved evidence does not search the transcript.
 */
export function focusEvidenceMessageId(
  signal: Pick<Signal, "evidence" | "evidenceStatus" | "evidenceSpans">,
  messages: Message[],
): string | null {
  if (signal.evidenceStatus === "valid") {
    return signal.evidenceSpans?.find((item) => messages.some((message) => message.id === item.messageId))?.messageId ?? null;
  }
  if (signal.evidenceStatus === "stale" || signal.evidenceStatus === "unresolved") {
    return null;
  }
  return firstEvidenceMessageId(signal.evidence, messages);
}
