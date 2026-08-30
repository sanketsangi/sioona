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

import { SignalReviewPair } from "@/components/SignalReviewPair";
import type { Message, Signal } from "@/lib/types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "Pause SIP",
    suggestedAction: "Call back before the SIP pause window closes.",
    evidence: ['quote: "Please pause my SIP this month"'],
    status: "new",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

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

describe("SignalReviewPair", () => {
  it("pairs the chat well with the stacked recommendation", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewPair, {
        signal: signal(),
        messages: [message()],
        customerName: "Priya",
      }),
    );

    expect(html).toContain("metric-strip");
    expect(html).toContain("lg:grid-cols-2");
    expect(html).toContain("Conversation");
    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Priya");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("Call back before the SIP pause window closes.");
    expect(html).toContain("chat-bubble--evidence");
    expect(html).toContain("Show in conversation: Please pause my SIP this month");
  });
});
