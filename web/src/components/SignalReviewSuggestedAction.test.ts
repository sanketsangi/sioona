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
  it("uses a single Feedback-style Card well with Pending chip and match tags", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        customerName: "Priya",
        className: "insights-review-pane insights-review-well overflow-hidden",
      }),
    );

    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Matched");
    expect(html).toContain(
      "Hi Priya, I noticed you said “Please pause my SIP this month”. I’d like to help — is there a good time to connect today?",
    );
    expect(html).toContain("Copy Reply");
    expect(html).toContain("Copy Reply to clipboard");
    expect(html).toContain("M2.75 0.5C1.7835 0.5");
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("aria-live");
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("Phrase");
    expect(html).toContain("pause my SIP");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("text-heading-16");
    expect(html).toContain("Pending");
    expect(html).toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).toContain("h-auto shrink-0 rounded-sm border-transparent px-2 py-0.5");
    expect(html).not.toContain("status-dot");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain("flex min-w-0 flex-wrap items-center justify-between");
    expect(html).toContain(
      'truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base',
    );
    expect(html).toContain("flex shrink-0 items-center");
    expect(html).not.toContain('data-slot="card-header"');
    expect(html).not.toContain('data-slot="card-title"');
    expect(html).not.toContain('data-slot="card-action"');
    expect(html).not.toContain("font-heading text-base");
    expect(html).not.toContain("group-data-[size=sm]/card:text-sm");
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="card-content"');
    expect(html).toContain("flex min-w-0 flex-col px-0");
    expect(html).not.toContain("overflow-y-auto");
    expect(html).not.toContain("overscroll-contain");
    expect(html).not.toContain("flex min-h-0 min-w-0 flex-1 flex-col");
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
    expect(html).toContain("data-slot=\"separator\"");
    expect(html).toContain("insights-review-well");
    expect(html).not.toContain("xl:grid-cols-2");
    expect(html).not.toContain("bg-sio-bg-muted/50");
    // One outer well — no nested Card; action band uses balanced py.
    expect(html.match(/insights-review-well/g)?.length).toBe(1);
    expect(html).toContain("justify-center gap-1.5 py-3");
    expect(html).toContain('data-slot="label"');
    expect(html).not.toContain("<blockquote");
    expect(html).not.toContain("border-l-2");
    expect(html).toContain("M14.5 8C14.5 11.5899");
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain('fill="#666666"');
    expect(html).toContain("flex min-w-0 items-start gap-2");
    expect(html).toContain("“Please pause my SIP this month”");
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-[10ex]");
    expect(html).toContain("outline-dashed");
    expect(html).toContain(
      "relative flex h-8 max-w-full flex-row items-center gap-1.5 rounded-[10ex] px-3 text-label-14",
    );
    expect(html).not.toContain("min-h-11 max-w-full flex-row");
    // WhyQuote: outline surface with shared radius + border-border.
    expect(html).toContain(
      "rounded-[var(--radius-control)] border border-border",
    );
    expect(html).not.toContain("evidence-highlight");
    expect(html).toContain("px-3 py-2");
    // Matched is a sibling Label section, not a muted sublabel under Why.
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
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-variant="outline"');
    expect(html).not.toContain("<blockquote");
    expect(html).not.toContain("border-l-2");
    expect(html).toContain("M14.5 8C14.5 11.5899");
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("“Please pause my SIP this month”");
    expect(html).toContain("rounded-[var(--radius-control)] border");
    expect(html).toContain("evidence-highlight");
    expect(html).toContain("border-transparent");
    expect(html).toContain("bg-sio-bg-interactive");
    expect(html).toContain('aria-pressed="true"');
  });

  it("highlights only the pressed Why This Fired quote", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: [
            'quote: "Please pause my SIP this month"',
            'quote: "I already trade equity CNC"',
          ],
        }),
        messages: [
          message(),
          message({
            id: "msg_2",
            content: "I already trade equity CNC",
          }),
        ],
        focusedMessageId: "msg_1",
        onFocusMessage: () => undefined,
      }),
    );

    expect(html).toContain('class="flex flex-col gap-3"');
    expect(html).toContain("evidence-highlight");
    expect(html.match(/evidence-highlight/g)?.length).toBe(1);
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain("Show in conversation: I already trade equity CNC");
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
    expect(html).toContain('data-slot="button"');
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-[10ex]");
    expect(html).toContain("outline-dashed");
    expect(html).toContain("outline-sio-border-strong");
    expect(html).toContain(
      "relative flex h-8 max-w-full flex-row items-center gap-1.5 rounded-[10ex] px-3 text-label-14",
    );
    expect(html).toContain('aria-pressed="true"');
  });

  it("shows honest empty copy when action and evidence are missing", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({ suggestedAction: "", evidence: [] }),
      }),
    );

    expect(html).toContain("Unavailable — local detection join missing.");
    expect(html).toContain("No local evidence.");
    expect(html).toContain("Copy Reply");
    expect(html).toContain('disabled=""');
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
        customerName: "Priya",
      }),
    );

    expect(html).toContain("Acted");
    expect(html).not.toContain("Pending");
    expect(html).toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).not.toContain("status-dot");
    expect(html).toContain("Marked as Acted — not sent.");
    expect(html).toContain(
      "Hi Priya, I noticed you said “Please pause my SIP this month”. I’d like to help — is there a good time to connect today?",
    );
    expect(html).toContain("Copy Reply");
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
        customerName: "Priya",
        actedWalk: {
          nextPreviewId: "sig_next",
          statusFilter: "followup",
        },
      }),
    );

    expect(html).toMatch(
      /Suggested Next Action[\s\S]*Mark as Acted[\s\S]*Hi Priya, I noticed you said/,
    );
    expect(html).toContain("Copy Reply");
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
