import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalReviewSuggestedAction } from "@/components/SignalReviewSuggestedAction";
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
    evidence: [
      'quote: "Please pause my SIP this month"',
      'phrase: "pause my SIP"',
    ],
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

describe("SignalReviewSuggestedAction", () => {
  it("stacks the recommendation over Why This Fired", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, { signal: signal() }),
    );

    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Call back before the SIP pause window closes.");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("Phrase");
    expect(html).toContain("pause my SIP");
    expect(html).toContain("Display only — not sent.");
    expect(html).toContain("Copy Reply");
    expect(html).toContain("Copy Reply to clipboard");
    expect(html).toContain("text-heading-16");
    expect(html).not.toContain("xl:grid-cols-2");
    expect(html).not.toContain("bg-sio-bg-muted/50");
  });

  it("hides Copy Reply when the suggested action is missing", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({ suggestedAction: "", evidence: [] }),
      }),
    );

    expect(html).not.toContain("Copy Reply");
  });

  it("turns joined quotes into conversation jump controls", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        messages: [message()],
        focusedMessageId: "msg_1",
        onFocusMessage: () => undefined,
      }),
    );

    expect(html).toContain("Show in conversation: Please pause my SIP this month");
    expect(html).toContain("conversation-message-msg_1");
    expect(html).toContain("aria-pressed");
  });

  it("shows honest empty copy when action and evidence are missing", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({ suggestedAction: "", evidence: [] }),
      }),
    );

    expect(html).toContain("Unavailable — local detection join missing.");
    expect(html).toContain("No local evidence.");
  });

  it("uses Neon stub honesty when the join is missing", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          id: "sig_neon_pred-1",
          suggestedAction: "",
          evidence: [],
        }),
      }),
    );

    expect(html).toContain("No local evidence — detection join missing.");
  });

  it("marks acted with locked SignalStatus and not-sent copy", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          status: "acted",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(html).toContain("Acted");
    expect(html).toContain("Marked as Acted — not sent.");
    expect(html).toContain("Call back before the SIP pause window closes.");
  });
});
