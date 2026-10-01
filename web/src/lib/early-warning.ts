/**
 * Early-warning patterns that show up before a customer says they are leaving.
 * These are not lead / retention / upsell signals and must not enter SignalScore.
 */

import { groupMessagesByConversation } from "./group-messages";
import type { Conversation, Message } from "./types";

export type EarlyWarningKind =
  | "repeated_complaint"
  | "unresolved"
  | "failed_payout"
  | "slow_reply"
  | "sentiment_trend";

export interface EarlyWarning {
  id: string;
  customerLabel: string;
  conversationIds: string[];
  kind: EarlyWarningKind;
  reason: string;
  quote?: string;
}

const COMPLAINT_RE =
  /\b(complain\w*|again|kitni baar|every time|still broken|not working|issue|problem|galat)\b/i;
const UNRESOLVED_RE =
  /\b(still waiting|still pending|no update|not resolved|issue (is )?open|koi jawab nahi|no one replied|waiting for)\b/i;
const RESOLVED_RE = /\b(resolved|sorted|credited|done|fixed|refunded)\b/i;
const FAILED_PAYOUT_RE =
  /\b(withdraw(?:al)? (?:failed|fail|pending|not credited)|payout (?:failed|not)|paisa nahi|amount not (?:received|credited)|refund not|not credited)\b/i;
const SLOW_TEXT_RE =
  /\b(no reply|no response|waiting since|days? no|haven't heard|koi reply nahi)\b/i;
const NEGATIVE_RE =
  /\b(angry|worst|fraud|useless|bakwas|bekaar|hate|leaving|pathetic)\b/i;
const POSITIVE_RE = /\b(thanks|thank you|resolved|great|happy|sorted)\b/i;

const SLOW_REPLY_MS = 4 * 60 * 60 * 1000;

const KIND_RANK: Record<EarlyWarningKind, number> = {
  failed_payout: 5,
  slow_reply: 4,
  repeated_complaint: 3,
  unresolved: 2,
  sentiment_trend: 1,
};

function customerKey(conversation: Conversation): string {
  const name = conversation.customerName?.trim().toLowerCase();
  return name || conversation.id;
}

function customerLabel(conversation: Conversation): string {
  return conversation.customerName?.trim() || "Customer";
}

function quoteFrom(text: string, pattern: RegExp): string | undefined {
  const match = text.match(pattern);
  if (!match || match.index == null) return undefined;
  const start = text.lastIndexOf("\n", match.index) + 1;
  const endBreak = text.indexOf("\n", match.index);
  const line = text.slice(start, endBreak === -1 ? undefined : endBreak).trim();
  if (line.length < 8) return undefined;
  return line.length > 180 ? `${line.slice(0, 177)}…` : line;
}

function sentimentScore(text: string): number {
  const negative = text.match(new RegExp(NEGATIVE_RE.source, "gi"))?.length ?? 0;
  const positive = text.match(new RegExp(POSITIVE_RE.source, "gi"))?.length ?? 0;
  return positive - negative;
}

function slowReplyReason(messages: Message[]): { reason: string; quote?: string } | null {
  const ordered = [...messages].sort((a, b) =>
    a.timestamp.localeCompare(b.timestamp)
  );
  for (let i = 0; i < ordered.length; i++) {
    const message = ordered[i];
    if (!message || message.role !== "customer") continue;
    const nextAgent = ordered.slice(i + 1).find((row) => row.role === "agent");
    if (!nextAgent) continue;
    const gap =
      Date.parse(nextAgent.timestamp) - Date.parse(message.timestamp);
    if (Number.isFinite(gap) && gap >= SLOW_REPLY_MS) {
      const hours = Math.round(gap / (60 * 60 * 1000));
      return {
        reason: `An agent reply landed about ${hours} hours after the customer wrote.`,
        quote: message.content.trim().slice(0, 180),
      };
    }
  }
  const blob = ordered
    .filter((row) => row.role === "customer")
    .map((row) => row.content)
    .join("\n");
  if (SLOW_TEXT_RE.test(blob)) {
    return {
      reason: "The customer says they have been waiting on a reply.",
      quote: quoteFrom(blob, SLOW_TEXT_RE),
    };
  }
  return null;
}

export function detectEarlyWarnings(
  conversations: Conversation[],
  messages: Message[]
): EarlyWarning[] {
  const byConversation = groupMessagesByConversation(messages);
  const groups = new Map<string, Conversation[]>();
  for (const conversation of conversations) {
    const key = customerKey(conversation);
    const list = groups.get(key);
    if (list) list.push(conversation);
    else groups.set(key, [conversation]);
  }

  const warnings: EarlyWarning[] = [];
  for (const [key, chats] of groups) {
    const orderedChats = [...chats].sort((a, b) =>
      a.startedAt.localeCompare(b.startedAt)
    );
    const label = customerLabel(orderedChats[0] ?? chats[0]!);
    const ids = orderedChats.map((chat) => chat.id);
    const customerMessages = orderedChats.flatMap((chat) =>
      (byConversation.get(chat.id) ?? []).filter((row) => row.role === "customer")
    );
    const blob = customerMessages.map((row) => row.content).join("\n");
    if (!blob.trim()) continue;

    const complaintHits = customerMessages.filter((row) =>
      COMPLAINT_RE.test(row.content)
    );
    const complaintChats = orderedChats.filter((chat) =>
      (byConversation.get(chat.id) ?? []).some(
        (row) => row.role === "customer" && COMPLAINT_RE.test(row.content)
      )
    );
    if (complaintHits.length >= 2 || complaintChats.length >= 2) {
      warnings.push({
        id: `ew_repeated_${key}`,
        customerLabel: label,
        conversationIds: ids,
        kind: "repeated_complaint",
        reason:
          complaintChats.length >= 2
            ? `Complaints show up in ${complaintChats.length} conversations before any exit line.`
            : "The same chat repeats a complaint more than once.",
        quote: quoteFrom(blob, COMPLAINT_RE),
      });
    }

    const unresolved = customerMessages.find((row) =>
      UNRESOLVED_RE.test(row.content)
    );
    if (unresolved) {
      const laterAgent = orderedChats.some((chat) =>
        (byConversation.get(chat.id) ?? []).some(
          (row) =>
            row.role === "agent" &&
            row.timestamp >= unresolved.timestamp &&
            RESOLVED_RE.test(row.content)
        )
      );
      if (!laterAgent) {
        warnings.push({
          id: `ew_unresolved_${key}`,
          customerLabel: label,
          conversationIds: ids,
          kind: "unresolved",
          reason: "The customer is still waiting and no later agent message marks it resolved.",
          quote: quoteFrom(unresolved.content, UNRESOLVED_RE) ?? unresolved.content.slice(0, 180),
        });
      }
    }

    if (FAILED_PAYOUT_RE.test(blob)) {
      warnings.push({
        id: `ew_payout_${key}`,
        customerLabel: label,
        conversationIds: ids,
        kind: "failed_payout",
        reason: "A withdrawal or payout is mentioned as failed or not credited.",
        quote: quoteFrom(blob, FAILED_PAYOUT_RE),
      });
    }

    for (const chat of orderedChats) {
      const slow = slowReplyReason(byConversation.get(chat.id) ?? []);
      if (!slow) continue;
      warnings.push({
        id: `ew_slow_${key}`,
        customerLabel: label,
        conversationIds: ids,
        kind: "slow_reply",
        reason: slow.reason,
        quote: slow.quote,
      });
      break;
    }

    if (orderedChats.length >= 2) {
      const first = sentimentScore(
        (byConversation.get(orderedChats[0]!.id) ?? [])
          .filter((row) => row.role === "customer")
          .map((row) => row.content)
          .join("\n")
      );
      const last = sentimentScore(
        (byConversation.get(orderedChats[orderedChats.length - 1]!.id) ?? [])
          .filter((row) => row.role === "customer")
          .map((row) => row.content)
          .join("\n")
      );
      if (last < first) {
        warnings.push({
          id: `ew_sentiment_${key}`,
          customerLabel: label,
          conversationIds: ids,
          kind: "sentiment_trend",
          reason: "Later conversations for this customer are more negative than the earlier ones.",
        });
      }
    }
  }

  return warnings.sort((a, b) => {
    const rank = KIND_RANK[b.kind] - KIND_RANK[a.kind];
    if (rank !== 0) return rank;
    return a.customerLabel.localeCompare(b.customerLabel);
  });
}

export const EARLY_WARNING_LABEL: Record<EarlyWarningKind, string> = {
  repeated_complaint: "Repeated complaint",
  unresolved: "Unresolved issue",
  failed_payout: "Failed withdrawal or payout",
  slow_reply: "Slow reply",
  sentiment_trend: "Sentiment getting worse",
};
