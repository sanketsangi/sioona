import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: (props: {
    href: string;
    children?: unknown;
    className?: string;
    scroll?: boolean;
    [key: string]: unknown;
  }) => {
    const { href, children, className, scroll, ...rest } = props;
    void scroll;
    return createElement("a", { href, className, ...rest }, children as never);
  },
}));

import {
  QUEUE_CARD_ACTION_CLASS,
  QUEUE_REVIEW_ACTION_CLASS,
  SignalQueueCard,
  SignalQueueRow,
} from "@/components/SignalQueueRow";
import type { Signal } from "@/lib/types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.91,
    confidence: 0.91,
    summary: "Priya asked to pause SIP",
    suggestedAction: "Call before the pause window closes.",
    evidence: ['quote: "Please pause my SIP this month"'],
    status: "new",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("SignalQueueRow", () => {
  it("styles queue Review actions as pills without global btn-secondary", () => {
    expect(QUEUE_REVIEW_ACTION_CLASS).toContain("rounded-full");
    expect(QUEUE_REVIEW_ACTION_CLASS).toContain("w-auto");
    expect(QUEUE_REVIEW_ACTION_CLASS).not.toContain("w-7");
    expect(QUEUE_REVIEW_ACTION_CLASS).not.toContain("w-full");
    expect(QUEUE_REVIEW_ACTION_CLASS).not.toContain("btn-secondary");
    expect(QUEUE_CARD_ACTION_CLASS).toContain("w-full");
    expect(QUEUE_CARD_ACTION_CLASS).toContain("min-h-11");
    expect(QUEUE_CARD_ACTION_CLASS).toContain("rounded-full");
  });

  it("renders a queue list row with Review and truncated summary", () => {
    const previewHref = "/?view=insights&preview=sig_1";
    const html = renderToStaticMarkup(
      createElement(SignalQueueRow, {
        signal: signal(),
        customerName: "Priya",
        previewHref,
        previewAriaLabel: "Open review for Priya",
        action: createElement(
          "a",
          { href: previewHref, className: "btn-tertiary" },
          "Review",
        ),
      }),
    );

    expect(html).toContain("Priya");
    expect(html).toContain("Asked to pause SIP");
    expect(html).toContain("truncate");
    expect(html).toContain(">Review</a>");
    expect(html).toContain("list-row");
    expect(html).toContain('data-queue-preview="true"');
    expect(html).toContain("data-queue-row-link");
    expect(html).toContain("data-queue-action");
    expect(html).toContain('aria-label="Open review for Priya"');
    expect(html).toContain("preview=sig_1");
    expect(html).toContain("Pending");
    expect(html).toContain("status-dot");
    expect(html).toContain("status-dot-queued");
    expect(html).not.toContain("bg-sio-status-pending-bg");
    expect(html).toContain('id="signal-summary-sig_1"');
    const previewAnchors = html.match(
      /href="\/\?view=insights&amp;preview=sig_1"/g,
    );
    expect(previewAnchors).toHaveLength(2);
    expect(html).not.toContain("data-expand-text");
    expect(html).not.toContain("data-selected");
    expect(html).not.toContain("Please pause my SIP this month");
  });

  it("renders the commercial label as a compact full-radius pill", () => {
    const html = renderToStaticMarkup(
      createElement(SignalQueueRow, {
        signal: signal({
          urgency: "low",
          urgencyTimeframe: "this week",
          mentionedValueInr: 3,
        }),
        customerName: "Priya",
      }),
    );

    expect(html).toContain("rounded-full");
    expect(html).toContain("text-label-12");
    expect(html).toContain("capitalize");
    expect(html).toContain("tabular");
    expect(html).toContain("truncate");
    expect(html).toContain("low · this week · ₹3");
    expect(html).toContain('title="low · this week · ₹3"');
  });

  it("renders a selected table row with expanded summary and no Review", () => {
    const html = renderToStaticMarkup(
      createElement(SignalQueueRow, {
        signal: signal(),
        customerName: "Priya",
        selected: true,
        expandText: true,
      }),
    );

    expect(html).toContain("Priya");
    expect(html).toContain("Asked to pause SIP");
    expect(html).toContain("whitespace-normal");
    expect(html).toContain('data-expand-text="true"');
    expect(html).toContain('data-selected="true"');
    expect(html).toContain("list-row");
    expect(html).not.toContain("data-queue-preview");
    expect(html).not.toContain("data-queue-row-link");
    expect(html).not.toContain("Review");
    expect(html).not.toContain("columnheader");
    expect(html).not.toContain("Please pause my SIP this month");
    expect(html).toContain('id="signal-review-summary-sig_1"');
    expect(html).not.toContain('id="signal-summary-sig_1"');
  });
});

describe("SignalQueueCard", () => {
  it("wraps signal text and keeps Review full width", () => {
    const previewHref = "/?view=insights&preview=sig_1";
    const html = renderToStaticMarkup(
      createElement(SignalQueueCard, {
        signal: signal(),
        customerName: "Priya",
        previewHref,
        previewAriaLabel: "Open review for Priya",
        action: createElement(
          "a",
          { href: previewHref, className: QUEUE_CARD_ACTION_CLASS },
          "Review",
        ),
      }),
    );

    expect(html).toContain("data-queue-card");
    expect(html).toContain("Priya");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("Asked to pause SIP");
    expect(html).toContain("Pending");
    expect(html).toContain("Retention");
    expect(html).toContain(">Review</a>");
    expect(html).toContain("w-full");
    expect(html).toContain("min-h-11");
    expect(html).toContain("[&amp;_a]:w-full");
    expect(html).toContain("data-queue-action");
  });
});
