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
  it("shows the full transcript in a chat well with a customer header", () => {
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
      }),
    );

    expect(html).toContain("Priya");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("I can help pause that SIP.");
    expect(html).not.toContain("Conversation");
    expect(html).not.toContain("2 messages");
    expect(html).not.toContain("<time");
    expect(html).not.toContain("Aug,");
    expect(html).toContain("max-w-md");
    expect(html).toContain("insights-review-chat");
    expect(html).toContain("insights-review-chat-header");
    expect(html).toContain(
      "truncate text-label-14 font-semibold leading-5 tracking-normal text-sio-fg-base",
    );
    expect(html).toContain("insights-review-chat-body");
    expect(html).toContain("px-3 sm:px-4");
    expect(html).toContain("min-h-0 flex-auto overflow-y-auto overscroll-contain py-3");
    expect(html).not.toContain("max-h-full");
    expect(html).not.toContain("min-h-[14rem]");
    expect(html).not.toContain("flex-1 overflow-y-auto");
    expect(html).not.toContain("flex h-full min-h-0");
    expect(html).not.toContain("px-1 py-4");
    expect(html).not.toContain("sm:px-2 sm:py-5");
    expect(html).toContain("items-start gap-2");
    expect(html).toContain("w-fit max-w-full");
    expect(html).toContain('data-align="end"');
    expect(html).toContain('data-align="start"');
    expect(html).toContain("flex-row-reverse");
    expect(html).toContain("chat-bubble--muted");
    expect(html).toContain("chat-bubble--default");
    expect(html).not.toContain("width:28px");
    expect(html).toContain("width:32px");
    expect(html).toContain("bg-sio-bg-subtle");
    expect(html).not.toContain("See Conversation");
    expect(html).not.toContain("No messages stored");
    expect(html).not.toContain("Showing last");
  });

  it("offers Upload Chats when no transcript is stored", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewConversation, {
        messages: [],
        customerName: "Priya",
      }),
    );

    expect(html).toContain("No messages stored");
    expect(html).toContain("No invented chat.");
    expect(html).toContain("Upload Chats");
    expect(html).toContain("view=upload");
    expect(html).toContain("Priya");
    expect(html).not.toContain("Conversation");
    expect(html).toContain("insights-review-chat-body");
    expect(html).toContain("min-h-0 flex-auto overflow-y-auto overscroll-contain py-3");
    expect(html).toContain("min-h-[12rem]");
    expect(html).not.toContain("max-h-full");
    expect(html).not.toContain("min-h-[14rem]");
    expect(html).not.toContain("flex min-h-[12rem] flex-1");
    expect(html).toContain("px-3 sm:px-4");
    expect(html).not.toContain("px-1 py-4");
    expect(html).not.toContain("<time");
    expect(html).not.toContain("Aug,");
    expect(html).not.toContain("See Conversation");
    expect(html).not.toContain("chat-bubble");
  });

  it("highlights the evidence turn on a long transcript", () => {
    const messages = Array.from({ length: 10 }, (_, i) =>
      message({
        id: `msg_${i + 1}`,
        content: i === 0 ? "Opening SIP question" : `Later turn ${i + 1}`,
      }),
    );
    const html = renderToStaticMarkup(
      createElement(SignalReviewConversation, {
        messages,
        customerName: "Priya",
        highlightedMessageId: "msg_1",
      }),
    );

    expect(html).toContain("Opening SIP question");
    expect(html).toContain("Later turn 10");
    expect(html).toContain("conversation-message-msg_1");
    expect(html).toContain("chat-bubble--evidence");
    expect(html).toContain("Evidence match");
    expect(html).toContain('data-evidence-match="true"');
    expect(html).toContain("scroll-mt-3");
    expect(html).toContain("min-h-0 flex-auto overflow-y-auto overscroll-contain py-3");
    expect(html).not.toContain("min-h-[14rem]");
    expect(html).not.toContain("<time");
    expect(html).not.toContain("Aug,");
    expect(html).not.toContain("Showing last");
    expect(html).not.toContain("See Conversation");
  });
});
