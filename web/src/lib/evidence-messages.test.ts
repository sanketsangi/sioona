import { describe, expect, it } from "vitest";
import {
  evidenceQuery,
  firstEvidenceMessageId,
  focusEvidenceMessageId,
  messageIdForEvidence,
} from "./evidence-messages";
import type { Message } from "./types";

function msg(
  id: string,
  content: string,
  role: Message["role"] = "customer",
): Message {
  return {
    id,
    conversationId: "conv_1",
    role,
    content,
    timestamp: `2026-08-01T00:00:0${id.replace(/\D/g, "").padStart(1, "0")}.000Z`,
  };
}

describe("evidenceQuery", () => {
  it("strips clipQuote ellipsis from quotes", () => {
    const long = "a".repeat(200);
    expect(evidenceQuery(`quote: "${long.slice(0, 139).trimEnd()}…"`)).toBe(
      long.slice(0, 139).trimEnd(),
    );
  });

  it("returns phrase, keyword, and suppressed terms", () => {
    expect(evidenceQuery('phrase: "close my account"')).toBe("close my account");
    expect(evidenceQuery('keyword: "churn"')).toBe("churn");
    expect(evidenceQuery('suppressed: "just asking"')).toBe("just asking");
  });

  it("returns null for unlabeled junk", () => {
    expect(evidenceQuery("nope")).toBeNull();
  });
});

describe("messageIdForEvidence", () => {
  const messages: Message[] = [
    msg("msg_agent", "We can help you stay", "agent"),
    msg("msg_early", "I have a billing question"),
    msg("msg_fire", "I want to close my account today"),
  ];

  it("prefers the latest customer message for a quote", () => {
    expect(
      messageIdForEvidence('quote: "I want to close my account today"', messages),
    ).toBe("msg_fire");
  });

  it("matches a clipped quote stem", () => {
    const body = `${"please help ".repeat(20)}I want to close my account`;
    const clipped = `${body.replace(/\s+/g, " ").trim().slice(0, 139).trimEnd()}…`;
    expect(
      messageIdForEvidence(`quote: "${clipped}"`, [msg("msg_long", body)]),
    ).toBe("msg_long");
  });

  it("matches phrase / keyword on the firing utterance", () => {
    expect(messageIdForEvidence('phrase: "close my account"', messages)).toBe(
      "msg_fire",
    );
    expect(
      messageIdForEvidence('keyword: "billing"', [
        msg("msg_a", "hello"),
        msg("msg_b", "billing issue again"),
      ]),
    ).toBe("msg_b");
  });

  it("ignores agent-only hits when a customer said it", () => {
    expect(
      messageIdForEvidence('phrase: "close my account"', [
        msg("msg_agent", "Do not close my account", "agent"),
        msg("msg_cust", "I will close my account"),
      ]),
    ).toBe("msg_cust");
  });

  it("returns null when no stored message contains the term", () => {
    expect(messageIdForEvidence('phrase: "upsell gold"', messages)).toBeNull();
  });
});

describe("firstEvidenceMessageId", () => {
  it("walks quotes before later match chips", () => {
    const messages = [msg("msg_1", "I want to close my account")];
    expect(
      firstEvidenceMessageId(
        ['quote: "I want to close my account"', 'phrase: "close my account"'],
        messages,
      ),
    ).toBe("msg_1");
  });

  it("skips evidence that does not join a message", () => {
    const messages = [msg("msg_1", "I want to close my account")];
    expect(
      firstEvidenceMessageId(
        ['quote: "not in this chat"', 'phrase: "close my account"'],
        messages,
      ),
    ).toBe("msg_1");
  });
});

describe("focusEvidenceMessageId", () => {
  it("uses the server message id and does not search a stale quote", () => {
    const messages = [msg("early", "Please pause my SIP"), msg("late", "other")];
    expect(
      focusEvidenceMessageId(
        {
          evidence: ['quote: "Please pause my SIP"'],
          evidenceStatus: "valid",
          evidenceSpans: [
            { messageId: "late", start: 0, end: 4, quote: "Please pause my SIP" },
          ],
        },
        messages,
      ),
    ).toBe("late");
    expect(
      focusEvidenceMessageId(
        {
          evidence: ['quote: "Please pause my SIP"'],
          evidenceStatus: "stale",
          evidenceSpans: [],
        },
        messages,
      ),
    ).toBeNull();
  });
});
