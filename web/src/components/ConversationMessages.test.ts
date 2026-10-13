import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConversationMessages } from "@/components/ConversationMessages";
import {
  MessageScroller,
  MessageScrollerContent,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller";
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

function withScroller(children: ReactNode) {
  return createElement(
    MessageScrollerProvider,
    { autoScroll: false, defaultScrollPosition: "start" },
    createElement(
      MessageScroller,
      null,
      createElement(
        MessageScrollerViewport,
        null,
        createElement(MessageScrollerContent, null, children),
      ),
    ),
  );
}

describe("ConversationMessages", () => {
  it("locks customer right / agent left with 32px avatars and no clocks", () => {
    const html = renderToStaticMarkup(
      withScroller(
        createElement(ConversationMessages, {
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
      ),
    );

    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("I can help pause that SIP.");
    expect(html).toContain("chat-bubble-group");
    expect(html).toContain('data-slot="message-scroller-item"');
    expect(html).toContain('data-scroll-anchor="false"');
    expect(html).not.toContain("space-y-4");
    expect(html).not.toContain("space-y-3");
    expect(html).toContain("chat-bubble--muted");
    expect(html).toContain("chat-bubble--default");
    expect(html).toContain('data-align="end"');
    expect(html).toContain('data-align="start"');
    expect(html).toContain("flex-row-reverse justify-start");
    expect(html).toContain("items-start gap-2");
    expect(html).toContain("w-fit max-w-full");
    expect(html).toContain("width:32px");
    expect(html).not.toContain("width:28px");
    expect(html).not.toContain("<time");
    expect(html).not.toContain("Aug,");
    // Agent sparkle mark (currentColor); customer SignalUser initials.
    expect(html).toContain("M8.40706 4.92939");
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain("#666666");
    expect(html).not.toContain("M8.75 2.79933");
    expect(html).toContain(">P</span>");
    expect(html).toContain("inline-flex min-w-0 items-center gap-2");
    expect(html).not.toContain("max-w-[min(24rem");
    expect(html).toContain("max-w-[calc(100%-2.5rem)]");
  });

  it("marks Why This Fired landing on the evidence bubble", () => {
    const html = renderToStaticMarkup(
      withScroller(
        createElement(ConversationMessages, {
          messages: [
            message(),
            message({
              id: "msg_2",
              role: "agent",
              content: "Later turn",
            }),
          ],
          customerName: "Priya",
          highlightedMessageId: "msg_1",
        }),
      ),
    );

    expect(html).toContain("conversation-message-msg_1");
    expect(html).toContain("chat-bubble--evidence");
    expect(html).toContain("Evidence match");
    expect(html).toContain('data-evidence-match="true"');
    expect(html).toContain('data-message-id="msg_1"');
    // Evidence is additive on the muted customer bubble; agent stays default-only.
    expect(html).toMatch(
      /chat-bubble[^"]*chat-bubble--muted[^"]*chat-bubble--evidence/,
    );
    expect(html).toContain("chat-bubble--default");
    expect(html).not.toMatch(
      /chat-bubble--default[^"]*chat-bubble--evidence/,
    );
    expect(html).not.toContain("<time");
  });

  it("marks an agent evidence bubble without dropping the default variant", () => {
    const html = renderToStaticMarkup(
      withScroller(
        createElement(ConversationMessages, {
          messages: [
            message(),
            message({
              id: "msg_2",
              role: "agent",
              content: "I can help pause that SIP.",
            }),
          ],
          customerName: "Priya",
          highlightedMessageId: "msg_2",
        }),
      ),
    );

    expect(html).toMatch(
      /chat-bubble[^"]*chat-bubble--default[^"]*chat-bubble--evidence/,
    );
    expect(html).toContain("chat-bubble--muted");
    expect(html).not.toMatch(
      /chat-bubble--muted[^"]*chat-bubble--evidence/,
    );
    expect(html).toContain('data-evidence-match="true"');
  });

  it("renders UTC clocks only when asked (drawer)", () => {
    const html = renderToStaticMarkup(
      withScroller(
        createElement(ConversationMessages, {
          messages: [message()],
          customerName: "Priya",
          showTimestamps: true,
        }),
      ),
    );

    expect(html).toContain("<time");
    expect(html).toContain('dateTime="2026-08-01T10:05:00.000Z"');
    expect(html).toContain("1 Aug, 10:05");
  });

  it("virtualizes long transcripts and keeps evidence id anchors", () => {
    const messages = Array.from({ length: 80 }, (_, index) =>
      message({
        id: `msg_${index}`,
        content: `Body ${index}`,
        role: index % 2 === 0 ? "customer" : "agent",
      }),
    );
    const html = renderToStaticMarkup(
      withScroller(
        createElement(ConversationMessages, {
          messages,
          customerName: "Priya",
        }),
      ),
    );

    expect(html).toContain("Body 0");
    expect(html).not.toContain("Body 79");
    expect(html).toContain('id="conversation-message-msg_79"');
    expect(html).toContain('id="conversation-message-msg_0"');
    expect(html).toContain('data-message-id="msg_0"');
  });

  it("mounts an offscreen evidence message with its DOM id", () => {
    const messages = Array.from({ length: 80 }, (_, index) =>
      message({
        id: `msg_${index}`,
        content: `Body ${index}`,
      }),
    );
    const html = renderToStaticMarkup(
      withScroller(
        createElement(ConversationMessages, {
          messages,
          customerName: "Priya",
          highlightedMessageId: "msg_79",
        }),
      ),
    );

    expect(html).toContain("Body 79");
    expect(html).toContain('id="conversation-message-msg_79"');
    expect(html).toContain("chat-bubble--evidence");
    expect(html).toContain('data-evidence-match="true"');
    expect(html).toContain('data-message-id="msg_79"');
    expect(html.split('id="conversation-message-msg_79"')).toHaveLength(2);
  });
});
