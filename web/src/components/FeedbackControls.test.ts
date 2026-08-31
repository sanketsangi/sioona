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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

import { FeedbackControls } from "@/components/FeedbackControls";
import type { Signal } from "@/lib/types";

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

describe("FeedbackControls", () => {
  it("uses a single Card well with Pending chip, note, and C/I/P", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackControls, {
        signal: signal(),
        className: "insights-review-pane insights-review-well overflow-hidden",
      }),
    );

    expect(html).toContain("Feedback");
    expect(html).toContain("Pending");
    expect(html).toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).toContain("Correct");
    expect(html).toContain("Incorrect");
    expect(html).toContain("Partially Correct");
    expect(html).toContain("Optional note");
    expect(html).toContain("aria-label=\"Feedback actions\"");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain("flex min-w-0 flex-wrap items-center justify-between");
    expect(html).toContain(
      "truncate text-label-13 font-semibold leading-5 tracking-normal text-sio-fg-base",
    );
    expect(html).not.toContain('data-slot="card-header"');
    expect(html).not.toContain('data-slot="card-title"');
    expect(html).not.toContain('data-slot="card-action"');
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('data-slot="card-content"');
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
    expect(html).toContain("insights-review-well");
    expect(html.match(/insights-review-well/g)?.length).toBe(1);
    expect(html).not.toContain("Adapt From Reviews");
    expect(html).not.toContain('role="alert"');
  });

  it("shows the Correct chip pressed when feedback is saved", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackControls, {
        signal: signal({
          status: "reviewed",
          feedback: {
            label: "correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(html).toContain("Correct");
    expect(html).not.toContain("Pending");
    expect(html).toContain("bg-sio-status-success-bg text-sio-status-success-fg");
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain(
      "C / I / P shortcuts · A / Enter → Mark as Acted on Suggested Next Action.",
    );
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
  });

  it("shows Adapt From Reviews when the label is incorrect", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackControls, {
        signal: signal({
          status: "reviewed",
          feedback: {
            label: "incorrect",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(html).toContain("Incorrect");
    expect(html).toContain("bg-sio-status-danger-bg text-sio-status-danger-fg");
    expect(html).toContain("Adapt From Reviews");
    expect(html).toContain("False positive?");
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
  });
});
