import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

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
  it("uses a single Feedback-style well with Pending chip and match tags", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        className: "insights-review-pane insights-review-well overflow-hidden",
      }),
    );

    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Matched");
    expect(html).toContain("Call back before the SIP pause window closes.");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("Phrase");
    expect(html).toContain("pause my SIP");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("text-heading-16");
    expect(html).toContain("Pending");
    expect(html).toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).toContain(
      "inline-flex shrink-0 items-center rounded-sm px-2 py-0.5 font-medium",
    );
    expect(html).not.toContain("status-dot");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain("data-slot=\"separator\"");
    expect(html).toContain("insights-review-well");
    expect(html).not.toContain("xl:grid-cols-2");
    expect(html).not.toContain("bg-sio-bg-muted/50");
    // One outer well — no nested header/body wells.
    expect(html.match(/insights-review-well/g)?.length).toBe(1);
    // Matched is a sibling section (h4), not a muted sublabel under Why.
    expect(html).toMatch(
      /Why This Fired[\s\S]*Matched[\s\S]*pause my SIP/,
    );
  });

  it("omits Matched section when only quotes exist", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: ['quote: "Please pause my SIP this month"'],
        }),
      }),
    );

    expect(html).toContain("Why This Fired");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).not.toContain("Matched");
  });

  it("shows Matched alone when there are matches but no quotes", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: ['phrase: "pause my SIP"'],
        }),
      }),
    );

    expect(html).toContain("Matched");
    expect(html).toContain("pause my SIP");
    expect(html).not.toContain("Why This Fired");
    expect(html).toContain("data-slot=\"separator\"");
    expect(html.match(/data-slot="separator"/g)?.length).toBe(1);
  });

  it("renders keyword match chips under Matched", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: [
            'quote: "Need this on record"',
            'keyword: "ledger"',
            'phrase: "prior tickets"',
          ],
        }),
      }),
    );

    expect(html).toContain("Matched");
    expect(html).toContain("Keyword");
    expect(html).toContain("ledger");
    expect(html).toContain("Phrase");
    expect(html).toContain("prior tickets");
    expect(html.match(/data-slot="separator"/g)?.length).toBe(2);
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

  it("turns joined phrase chips into conversation jump controls", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: ['phrase: "pause my SIP"'],
        }),
        messages: [message()],
        focusedMessageId: "msg_1",
        onFocusMessage: () => undefined,
      }),
    );

    expect(html).toContain("Matched");
    expect(html).toContain("Phrase");
    expect(html).toContain("Show in conversation: pause my SIP");
    expect(html).toContain("conversation-message-msg_1");
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
    expect(html).not.toContain("Pending");
    expect(html).toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).not.toContain("status-dot");
    expect(html).toContain("Marked as Acted — not sent.");
    expect(html).toContain("Call back before the SIP pause window closes.");
  });

  it("puts Mark as Acted in the header and omits the Correct chip", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          status: "reviewed",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
        actedWalk: {
          nextPreviewId: "sig_next",
          statusFilter: "followup",
        },
      }),
    );

    expect(html).toMatch(
      /Suggested Next Action[\s\S]*Mark as Acted[\s\S]*Call back before the SIP pause window closes/,
    );
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("btn-primary");
    expect(html).toContain("aria-keyshortcuts");
    expect(html).not.toContain("bg-sio-status-success-bg");
    expect(html).not.toContain("status-dot");
    expect(html).not.toContain("A / Enter → Mark as Acted.");
  });

  it("omits rail Mark as Acted without walk context", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          status: "reviewed",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(html).not.toContain("Mark as Acted");
  });
});
