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

import { SignalQueueRow } from "@/components/SignalQueueRow";
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
  it("renders a queue list row with Review and truncated summary", () => {
    const html = renderToStaticMarkup(
      createElement(SignalQueueRow, {
        signal: signal(),
        customerName: "Priya",
        previewHref: "/?view=insights&preview=sig_1",
        previewAriaLabel: "Open review for Priya",
        action: createElement(
          "a",
          { href: "/?view=insights&preview=sig_1", className: "btn-tertiary" },
          "Review",
        ),
      }),
    );

    expect(html).toContain("Priya");
    expect(html).toContain("pause SIP");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain(">Review</a>");
    expect(html).toContain("list-row");
    expect(html).not.toContain("data-expand-text");
    expect(html).not.toContain("aria-current");
  });

  it("renders a selected review identity without table columns or Review", () => {
    const html = renderToStaticMarkup(
      createElement(SignalQueueRow, {
        signal: signal(),
        customerName: "Priya",
        selected: true,
        expandText: true,
      }),
    );

    expect(html).toContain("Priya");
    expect(html).toContain("pause SIP");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain('data-expand-text="true"');
    expect(html).toContain('aria-current="true"');
    expect(html).not.toContain("list-row");
    expect(html).not.toContain("Review");
    expect(html).not.toContain("columnheader");
  });
});
