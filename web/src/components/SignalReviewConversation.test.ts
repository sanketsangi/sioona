import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: unknown;
    className?: string;
  }) => createElement("a", { href, className }, children as never),
}));

import { SignalReviewConversation } from "@/components/SignalReviewConversation";
import { REVIEW_TRANSCRIPT_PREVIEW } from "@/lib/format";
import type { Message } from "@/lib/types";

function message(overrides: Partial<Message> = {}): Message {
  return {
    id: "msg_1",
    conversationId: "conv_1",
    role: "customer",
    content: "Please pause my SIP this month",
    timestamp: "2026-08-01T10:05:00.000Z",
    ...overrides,
  };
}

describe("SignalReviewConversation", () => {
  it("previews the transcript beside See Conversation", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewConversation, {
        messages: [
          message(),
          message({
            id: "msg_2",
            role: "agent",
            content: "I can help pause that SIP.",
            timestamp: "2026-08-01T10:06:00.000Z",
          }),
        ],
        customerName: "Priya",
        typeLabel: "Retention",
        summary: "Pause SIP",
      }),
    );

    expect(html).toContain("Conversation");
    expect(html).toContain("Priya");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("I can help pause that SIP.");
    expect(html).toContain("See Conversation");
    expect(html).toContain("2 messages");
    expect(html).toContain("1 Aug, 10:05");
    expect(html).not.toContain("No messages stored");
    expect(html).not.toContain("Showing last");
  });

  it("offers Upload Chats when no transcript is stored", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewConversation, {
        messages: [],
        customerName: "Priya",
        typeLabel: "Retention",
        summary: "Pause SIP",
      }),
    );

    expect(html).toContain("No messages stored");
    expect(html).toContain("No invented chat.");
    expect(html).toContain("Upload Chats");
    expect(html).toContain("view=upload");
    expect(html).not.toContain("See Conversation");
  });

  it("notes a truncated tail when the transcript is longer than the preview", () => {
    const messages = Array.from(
      { length: REVIEW_TRANSCRIPT_PREVIEW + 2 },
      (_, i) =>
        message({
          id: `msg_${i + 1}`,
          content:
            i === 0 ? "Opening SIP question" : `Later turn ${i + 1}`,
        }),
    );
    const html = renderToStaticMarkup(
      createElement(SignalReviewConversation, {
        messages,
        customerName: "Priya",
        typeLabel: "Retention",
        summary: "Pause SIP",
      }),
    );

    expect(html).toContain(`Showing last ${REVIEW_TRANSCRIPT_PREVIEW} of ${messages.length} messages`);
    expect(html).toContain(`Later turn ${REVIEW_TRANSCRIPT_PREVIEW + 2}`);
    expect(html).not.toContain("Opening SIP question");
  });
});
