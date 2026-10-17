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

import {
  ADAPT_NOTE_HELPER,
  FeedbackControls,
  isFeedbackPrimaryChrome,
  reduceFeedbackChromeLabel,
  shouldSkipFeedbackResubmit,
} from "@/components/FeedbackControls";
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

describe("reduceFeedbackChromeLabel", () => {
  it("selects instantly, rolls back to prior, and reconciles to Neon/server", () => {
    expect(
      reduceFeedbackChromeLabel(null, { type: "select", label: "correct" }),
    ).toBe("correct");
    expect(
      reduceFeedbackChromeLabel("correct", {
        type: "rollback",
        previous: null,
      }),
    ).toBeNull();
    expect(
      reduceFeedbackChromeLabel("incorrect", {
        type: "rollback",
        previous: "correct",
      }),
    ).toBe("correct");
    expect(
      reduceFeedbackChromeLabel("correct", {
        type: "reconcile",
        serverLabel: "correct",
      }),
    ).toBe("correct");
    expect(
      reduceFeedbackChromeLabel("correct", {
        type: "reconcile",
        serverLabel: null,
      }),
    ).toBeNull();
  });
});

describe("isFeedbackPrimaryChrome", () => {
  it("defaults Correct to inverse while pending; exclusive after a choice", () => {
    expect(isFeedbackPrimaryChrome("correct", null)).toBe(true);
    expect(isFeedbackPrimaryChrome("incorrect", null)).toBe(false);
    expect(isFeedbackPrimaryChrome("partially_correct", null)).toBe(false);
    expect(isFeedbackPrimaryChrome("correct", "correct")).toBe(true);
    expect(isFeedbackPrimaryChrome("incorrect", "correct")).toBe(false);
    expect(isFeedbackPrimaryChrome("correct", "incorrect")).toBe(false);
    expect(isFeedbackPrimaryChrome("incorrect", "incorrect")).toBe(true);
    expect(isFeedbackPrimaryChrome("partially_correct", "partially_correct")).toBe(
      true,
    );
    expect(isFeedbackPrimaryChrome("correct", "partially_correct")).toBe(false);
  });
});

describe("shouldSkipFeedbackResubmit", () => {
  it("skips only when the same label is already on the server and note is clean", () => {
    expect(
      shouldSkipFeedbackResubmit({
        label: "correct",
        serverLabel: "correct",
        noteDirty: false,
      }),
    ).toBe(true);
    expect(
      shouldSkipFeedbackResubmit({
        label: "incorrect",
        serverLabel: "correct",
        noteDirty: false,
      }),
    ).toBe(false);
    expect(
      shouldSkipFeedbackResubmit({
        label: "correct",
        serverLabel: null,
        noteDirty: false,
      }),
    ).toBe(false);
    expect(
      shouldSkipFeedbackResubmit({
        label: "correct",
        serverLabel: "correct",
        noteDirty: true,
      }),
    ).toBe(false);
  });
});

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
    expect(html).toContain("Partial");
    expect(html).toContain("@container/feedback");
    expect(html).toContain("@min-[12rem]/feedback:hidden");
    expect(html).not.toContain("min-[420px]");
    expect(html).toContain("Optional note");
    expect(html).not.toContain("C / I / P · Enter → Correct.");
    expect(html).not.toContain(
      "Copy Reply, then A / Enter → Acted (does not send).",
    );
    expect(html).not.toContain('role="note"');
    expect(html).not.toContain("saves to Neon");
    expect(html).not.toContain("Saving…");
    expect(html).toContain("aria-label=\"Feedback actions\"");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain("flex min-w-0 flex-wrap items-center justify-between");
    expect(html).toContain(
      "min-w-0 flex-1 truncate text-heading-14 font-medium text-sio-fg-base",
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
    expect(html).not.toContain(
      "Partial counts against the weekly score the same as Incorrect.",
    );
  });

  const INVERSE =
    "bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90";
  const OUTLINE =
    "min-h-9 w-full touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive";

  /** Exclusive C/I/P: only the pressed label is inverse; others outline. */
  function expectExclusiveInverse(html: string) {
    const inverseCount = html.split(INVERSE).length - 1;
    expect(inverseCount).toBe(1);
    expect(html).toContain('aria-pressed="true"');
    // Two unselected buttons share outline chrome.
    expect(html.split(OUTLINE).length - 1).toBeGreaterThanOrEqual(2);
  }

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
    expect(html).toContain(INVERSE);
    expectExclusiveInverse(html);
    expect(html).not.toContain(
      "border-sio-border-strong bg-sio-bg-interactive-hover",
    );
    expect(html).not.toContain(
      "Copy Reply, then A / Enter → Acted (does not send).",
    );
    expect(html).not.toContain('role="note"');
    expect(html).not.toContain(
      "Copy Reply from Suggested Next Action, then Mark Acted",
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
    expect(html).toContain("aria-pressed=\"true\"");
    // Pressed I only — Correct is outline when not selected (exclusive inverse).
    expect(html).toContain(INVERSE);
    expectExclusiveInverse(html);
    expect(html).toContain(OUTLINE);
    expect(html).not.toContain(
      "border-sio-border-strong bg-sio-bg-interactive-hover",
    );
    expect(html).toContain("Adapt From Reviews");
    expect(html).toContain(ADAPT_NOTE_HELPER);
    expect(html).not.toContain("False positive? Add a negative phrase.");
    expect(html).not.toContain("Add a negative phrase");
    expect(html).not.toContain("so this pattern stops firing");
    // Helper-note chrome; Adapt CTA matches Open Conversation outline h-8.
    expect(html).toContain("min-h-10");
    expect(html).toContain("justify-between gap-x-3 pr-3");
    expect(html).toContain("border-sio-border-subtle bg-sio-bg-muted");
    expect(html).toContain("text-pretty text-copy-14 text-sio-fg-subtle");
    // asChild Link gets outline classes (no data-size on the <a>).
    expect(html).toContain("border-border bg-background");
    expect(html).toContain("h-8 gap-2 shrink-0");
    expect(html).not.toContain(
      "min-h-9 touch-manipulation border-sio-border-subtle bg-sio-bg-base text-sio-fg-base hover:border-sio-border-strong hover:bg-sio-bg-interactive",
    );
    expect(html).toContain('href="');
    expect(html).toMatch(/href="[^"]*view=eval[^"]*panel=adapt/);
    expect(html).toContain('role="status"');
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
  });

  it("uses exclusive inverse pressed chrome for Partially Correct", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackControls, {
        signal: signal({
          status: "reviewed",
          feedback: {
            label: "partially_correct",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
      }),
    );

    expect(html).toContain("Partially Correct");
    expect(html).toContain(
      "bg-sio-status-warning-bg text-sio-status-warning-fg",
    );
    expect(html).toContain("aria-pressed=\"true\"");
    expect(html).toContain(INVERSE);
    expectExclusiveInverse(html);
    // Unselected Correct + Incorrect stay outline (not inverse).
    expect(html).toContain(OUTLINE);
    expect(html).not.toContain(
      "border-sio-border-strong bg-sio-bg-interactive-hover",
    );
    expect(html).toContain(ADAPT_NOTE_HELPER);
    expect(html).not.toContain("Wrong rationale? Add the right phrase.");
    expect(html).not.toContain("Add the right phrase");
    expect(html).toContain("Adapt From Reviews");
    expect(html).not.toContain(
      "Partial counts against the weekly score the same as Incorrect.",
    );
    expect(html).toContain("Optional note");
    expect(html).toContain("Correct");
    expect(html).toContain("Incorrect");
  });

  it("defaults Correct to inverse while pending; I/P stay outline", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackControls, {
        signal: signal(),
      }),
    );

    expect(html).toContain("Pending");
    // Default primary chrome only — not pressed until saved/optimistic select.
    expect(html.split(INVERSE).length - 1).toBe(1);
    expect(html.split(OUTLINE).length - 1).toBe(2);
    expect(html).not.toContain('aria-pressed="true"');
    expect(html).toContain('data-variant="default"');
    expect(html).toContain('data-variant="outline"');
  });

  it("mounts Ground Truth FilterPill in the Feedback header when conversationId is set", () => {
    const html = renderToStaticMarkup(
      createElement(FeedbackControls, {
        signal: signal(),
        conversationId: "conv_1",
      }),
    );

    expect(html).toContain('aria-label="Ground Truth, Unset"');
    expect(html).toContain("Ground Truth");
    expect(html).toContain("Unset");
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-full");
    // Right-aligned cluster: Feedback status then GT (GT pinned to the corner).
    expect(html.indexOf("Pending")).toBeLessThan(
      html.indexOf('aria-label="Ground Truth, Unset"'),
    );
    expect(html.match(/data-slot="card"/g)?.length).toBe(1);
  });
});
