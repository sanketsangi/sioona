import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { ConversationMessages } from "@/components/ConversationMessages";
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

describe("ConversationMessages", () => {
  it("locks customer right / agent left with 32px avatars and no clocks", () => {
    const html = renderToStaticMarkup(
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
    );

    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("I can help pause that SIP.");
    expect(html).toContain("chat-bubble-group");
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
  });

  it("marks Why This Fired landing on the evidence bubble", () => {
    const html = renderToStaticMarkup(
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
    );

    expect(html).toContain("conversation-message-msg_1");
    expect(html).toContain("chat-bubble--evidence");
    expect(html).toContain("Evidence match");
    expect(html).toContain('data-evidence-match="true"');
    expect(html).not.toContain("<time");
  });

  it("renders UTC clocks only when asked (drawer)", () => {
    const html = renderToStaticMarkup(
      createElement(ConversationMessages, {
        messages: [message()],
        customerName: "Priya",
        showTimestamps: true,
      }),
    );

    expect(html).toContain("<time");
    expect(html).toContain('dateTime="2026-08-01T10:05:00.000Z"');
    expect(html).toContain("1 Aug, 10:05");
  });
});
