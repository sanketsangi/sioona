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

import {
  queueActionKindForSignal,
  queueActionLabelForSignal,
  RetentionEmailAction,
} from "@/components/RetentionEmailAction";
import { createRetentionEmailAction } from "@/lib/supervised-actions";
import type { Signal } from "@/lib/types";

function signal(overrides: Partial<Signal> = {}): Signal {
  return {
    id: "sig_1",
    tenantId: "tenant_demo",
    conversationId: "conv_1",
    type: "retention",
    score: 0.9,
    confidence: 0.9,
    summary: "Close account",
    suggestedAction: "Call back",
    evidence: ['quote: "I want to close my account"'],
    status: "new",
    createdAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("queueActionLabelForSignal", () => {
  it("returns Approve for high-confidence retention", () => {
    expect(queueActionLabelForSignal(signal(), "Priya")).toBe("Approve");
  });

  it("returns Review for lead signals without a stored action", () => {
    expect(
      queueActionLabelForSignal(
        signal({ type: "lead", confidence: 0.95 }),
        "Rahul",
      ),
    ).toBe("Review");
  });

  it("returns Approve when a stored retention draft exists", () => {
    const stored = createRetentionEmailAction({
      signal: signal({ type: "lead", confidence: 0.4 }),
      customerName: "Priya",
    });
    expect(
      queueActionLabelForSignal(
        signal({ type: "lead", confidence: 0.4 }),
        "Priya",
        stored,
      ),
    ).toBe("Approve");
  });

  it("returns Mark as Acted for Correct ¬acted follow-up", () => {
    expect(
      queueActionLabelForSignal(
        signal({
          status: "reviewed",
          feedback: {
            label: "correct",
            reviewedAt: "2026-09-03T00:00:00.000Z",
          },
        }),
        "Priya",
      ),
    ).toBe("Mark as Acted");
  });

  it("returns Review for acted Done rows", () => {
    expect(
      queueActionLabelForSignal(
        signal({
          status: "acted",
          feedback: {
            label: "correct",
            reviewedAt: "2026-09-03T00:00:00.000Z",
          },
        }),
        "Priya",
      ),
    ).toBe("Review");
  });
});

describe("queueActionKindForSignal", () => {
  it("prefers mark_acted over approve for Correct ¬acted retention", () => {
    expect(
      queueActionKindForSignal(
        signal({
          status: "reviewed",
          feedback: {
            label: "correct",
            reviewedAt: "2026-09-03T00:00:00.000Z",
          },
        }),
        "Priya",
      ),
    ).toBe("mark_acted");
  });
});

describe("RetentionEmailAction", () => {
  it("shows evidence and draft side by side with decision buttons", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );

    expect(html).toContain("Retention Email");
    expect(html).toContain("Pending");
    expect(html).toContain("Approve Draft");
    expect(html).not.toContain("Approve &amp; Send");
    expect(html).toContain("Edit");
    expect(html).toContain("Dismiss");
    expect(html).toContain("Evidence");
    expect(html).toContain("Draft");
    expect(html).toContain("I want to close my account");
    // Review Evidence|Draft before decision buttons.
    expect(html.indexOf("Evidence")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html.indexOf("Draft")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html).toContain("Checking in on your account");
    expect(html).toContain("Hi Priya,");
    expect(html).toContain("retention-email-columns");
    expect(html).toContain("retention-email-draft-swap");
    expect(html).toContain('data-draft-mode="view"');
    expect(html).not.toContain("Save Edit");
    // Vertical stack lives in .retention-email-columns (globals.css).
    expect(html).not.toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
    );
    expect(html).toContain("flex-nowrap");
    expect(html).toContain("Sioona never sends or CRM-tags");
    expect(html).toContain(
      "You send from your tools — Sioona never sends or CRM-tags.",
    );
    expect(html).toContain("data-review-slot=\"retention-email\"");
    // Standalone keeps pane-header chrome.
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain(
      "truncate text-label-14 font-semibold leading-5 tracking-normal text-sio-fg-base",
    );
    expect(html).toContain('data-slot="card"');
  });

  it("embeds as a quiet Why/Matched-density section without pane header", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
        embedded: true,
      }),
    );

    expect(html).toContain('data-review-slot="retention-email"');
    expect(html).toContain("surface-quiet");
    expect(html).toContain("mx-3");
    expect(html).toContain("mb-3");
    expect(html).toContain("mt-3");
    expect(html).toContain("gap-2");
    expect(html).not.toContain("ps-6");
    expect(html).toContain("border-sio-border-subtle");
    expect(html).toContain("gap-1.5");
    // align-items:stretch lives on .retention-email-columns in globals.css
    expect(html).toContain("retention-email-columns");
    expect(html).toContain("flex-nowrap");
    expect(html).not.toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
    );
    expect(html).toContain("Retention Email");
    expect(html).toContain("Pending");
    expect(html).toContain("Approve Draft");
    expect(html).toContain("High-confidence retention draft");
    expect(html).toContain("Evidence");
    expect(html).toContain("Draft");
    expect(html.indexOf("Evidence")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html).toContain("rounded-[var(--radius-control)]");
    // Quiet subsection labels (Why This Fired / Matched), not pill chips.
    expect(html).not.toContain("rounded-full");
    expect(html).toContain(
      "text-label-12 leading-5 font-semibold tracking-normal text-sio-fg-subtle",
    );
    expect(html).not.toContain(
      "shadow-[0_1px_3px_0_rgba(0,0,0,0.04),0_0_0_1px_rgba(0,0,0,0.06)]",
    );
    expect(html).toContain("<h3");
    expect(html).toContain(
      "min-w-0 flex-1 truncate text-label-14 font-semibold leading-5 tracking-normal text-sio-fg-base",
    );
    expect(html).toContain("[mask-image:var(--geist-icon)]");
    expect(html).toContain("size-4 shrink-0 text-sio-fg-base");
    expect(html).not.toContain('data-slot="card"');
    expect(html).not.toContain("data-slot=\"separator\"");
    expect(html).not.toContain("border-b border-sio-border-base");
    expect(html).not.toContain('data-slot="label"');
  });

  it("renders nothing for lead signals without a stored action", () => {
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal({ type: "lead", confidence: 0.95 }),
        customerName: "Rahul",
      }),
    );
    expect(html).toBe("");
  });

  it("keeps Approve / Edit / Dismiss after Approved so partners can revise", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    action.status = "approved";
    action.decidedAt = "2026-09-02T00:00:00.000Z";
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );
    expect(html).toContain(
      "Approved — not sent. Run it in your tools; Sioona never CRM-tags.",
    );
    expect(html).toContain("Approved");
    expect(html).not.toContain("High-confidence retention draft");
    expect(html).not.toContain("Approve &amp; Send");
    expect(html).toContain("Approve Draft");
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Dismiss<");
    expect(html).not.toContain("This draft already has a decision.");
  });

  it("keeps Approve / Edit / Dismiss after an edited draft save", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    action.status = "edited";
    action.decidedAt = "2026-09-02T00:00:00.000Z";
    action.body = "Hi Priya,\n\nRevised retention note.";
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );

    expect(html).toContain("Edited");
    expect(html).toContain(
      "Edited draft saved — not sent. You send from your tools.",
    );
    expect(html).toContain("Approve Draft");
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Dismiss<");
    expect(html).toContain("Revised retention note.");
  });

  it("keeps Approve / Edit / Dismiss after Dismissed so partners can revise", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    action.status = "dismissed";
    action.decidedAt = "2026-09-02T00:00:00.000Z";
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );
    expect(html).toContain(
      "Dismissed. Sioona never sends — nothing to run outside.",
    );
    expect(html).toContain("Approve Draft");
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Dismiss<");
  });
});
