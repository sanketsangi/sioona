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
  retentionEmailBodyPreview,
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

  it("returns Marked as Acted for acted Done rows", () => {
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
    ).toBe("Marked as Acted");
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

  it("returns acted for Done rows", () => {
    expect(
      queueActionKindForSignal(
        signal({
          status: "acted",
          feedback: {
            label: "correct",
            reviewedAt: "2026-09-03T00:00:00.000Z",
          },
        }),
        "Priya",
      ),
    ).toBe("acted");
  });
});

describe("retentionEmailBodyPreview", () => {
  it("returns full body without expand when ≤3 lines", () => {
    const short = "Hi Priya,\n\nRevised retention note.";
    expect(retentionEmailBodyPreview(short)).toEqual({
      preview: short,
      remainder: "",
      expandable: false,
    });
  });

  it("splits after the first 3 lines when longer", () => {
    const body = [
      "Hi Priya,",
      "",
      "You mentioned closing.",
      "",
      "I can review fees.",
      "",
      "Best regards",
    ].join("\n");
    expect(retentionEmailBodyPreview(body)).toEqual({
      preview: "Hi Priya,\n\nYou mentioned closing.",
      remainder: "\nI can review fees.\n\nBest regards",
      expandable: true,
    });
  });
});

describe("RetentionEmailAction", () => {
  it("collapses long draft bodies to 3 lines with Show more", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    const preview = retentionEmailBodyPreview(action.body);
    expect(preview.expandable).toBe(true);

    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );

    expect(html).toContain("Show more");
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain("aria-controls=");
    // Quiet pill expand control (not bare link text) — stroke so rounded-full reads.
    expect(html).toContain(
      "rounded-full border border-sio-border-subtle px-2.5",
    );
    expect(html).toContain("hover:border-sio-border-strong");
    expect(html).toContain("min-h-11");
    expect(html).toContain("md:min-h-6");
    expect(html).toContain(preview.preview);
    expect(html).not.toContain("Show less");
    // Remainder stays behind expand — not in the collapsed view pane.
    expect(html).not.toContain("I can review fees, settlement, or account options");
    expect(html).not.toContain("Would a brief call today or tomorrow work?");
    expect(html).not.toContain("Best regards");
    // Subject stays fully visible; decision buttons stay below the body.
    expect(html).toContain("Following up on your account — can we help?");
    expect(html.indexOf("Show more")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html.indexOf("Hi Priya,")).toBeLessThan(html.indexOf("Show more"));
  });

  it("hides expand control when draft body has ≤3 lines", () => {
    const action = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
      evidence: ['quote: "I want to close my account"'],
    });
    action.body = "Hi Priya,\n\nShort note only.";
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal(),
        customerName: "Priya",
        action,
      }),
    );

    expect(html).toContain("Short note only.");
    expect(html).not.toContain("Show more");
    expect(html).not.toContain("Show less");
    expect(html).not.toContain('aria-expanded="');
  });

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
    // Review Evidence|Draft|body before decision buttons.
    expect(html.indexOf("Evidence")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html.indexOf("Draft")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html.indexOf("Hi Priya,")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html).toContain("Following up on your account — can we help?");
    expect(html).toContain("Hi Priya,");
    expect(html).toContain("retention-email-columns");
    expect(html).toContain("retention-email-draft-swap");
    expect(html).toContain('data-draft-mode="view"');
    expect(html).not.toContain("Save Edit");
    // Vertical stack lives in .retention-email-columns (globals.css).
    expect(html).not.toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
    );
    // Decision row: end-aligned Approve / Edit / Dismiss (no hairline).
    expect(html).toContain(
      "flex flex-wrap items-center justify-end gap-2",
    );
    expect(html).not.toContain(
      "flex flex-wrap items-center justify-end gap-1 pt-0.5",
    );
    expect(html).not.toContain(
      "flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5",
    );
    expect(html).not.toContain("flex-nowrap");
    // Flush draft preview — subject stronger than body; no nested draft card.
    expect(html).toContain(
      "m-0 break-words text-label-14 font-semibold leading-5 tracking-[-0.01em] text-sio-fg-base",
    );
    expect(html).toContain(
      "m-0 whitespace-pre-wrap break-words font-sans text-pretty text-copy-14 leading-6 text-sio-fg-subtle",
    );
    expect(html).not.toContain(
      "rounded-[var(--radius-control)] border border-sio-border-subtle px-2.5 py-2 bg-sio-bg-base",
    );
    expect(html).toContain("Sioona never sends or CRM-tags");
    expect(html).toContain(
      "You send from your tools — Sioona never sends or CRM-tags.",
    );
    // First-click Approve/Dismiss submit directly — no confirm Dialog chrome.
    expect(html).not.toContain("This records your approval for later evaluation");
    expect(html).not.toContain("Dismiss Draft");
    expect(html).not.toContain('aria-haspopup="dialog"');
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
    expect(html).toContain(
      "flex flex-wrap items-center justify-end gap-2",
    );
    expect(html).not.toContain(
      "flex flex-wrap items-center justify-end gap-1 pt-0.5",
    );
    expect(html).not.toContain(
      "flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5",
    );
    expect(html).not.toContain("flex-nowrap");
    expect(html).not.toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
    );
    expect(html).toContain("Retention Email");
    // Status chip is owned by Recommended Actions when embedded — not here.
    expect(html).not.toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).toContain("Approve Draft");
    expect(html).toContain("High-confidence retention draft");
    expect(html).toContain("Evidence");
    expect(html).toContain("Draft");
    // Draft title + body precede decision buttons under the draft pane.
    expect(html.indexOf(">Draft<")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html.indexOf("Hi Priya,")).toBeLessThan(html.indexOf("Approve Draft"));
    expect(html.indexOf("Evidence")).toBeLessThan(html.indexOf("Approve Draft"));
    // Evidence keeps a quiet tonal well; draft is flush (no nested card).
    expect(html).toContain("rounded-[var(--radius-control)]");
    expect(html).toContain("bg-sio-bg-muted/40");
    expect(html).not.toContain(
      "rounded-[var(--radius-control)] border border-sio-border-subtle px-2.5 py-2 bg-sio-bg-base",
    );
    // Quiet subsection labels (Why This Fired / Matched), not status chips;
    // Show more/less is the only rounded-full pill in this embed.
    expect(html).toContain(
      "rounded-full border border-sio-border-subtle px-2.5",
    );
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

  it("omits Evidence well when Why This Fired already owns the quote", () => {
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
        omitEvidence: true,
      }),
    );

    expect(html).toContain("Retention Email");
    expect(html).toContain("Draft");
    expect(html).toContain("Approve Draft");
    expect(html).toContain(">Edit<");
    expect(html).toContain(">Dismiss<");
    expect(html).toContain('data-retention-email-panel="draft"');
    expect(html).not.toContain('data-retention-email-panel="evidence"');
    expect(html).not.toContain(
      '<span>Evidence</span>',
    );
    // Flush draft when Why owns the quote — no evidence→draft hairline on the panel.
    expect(html).toContain('data-retention-email-panel="draft"');
    expect(html).not.toContain(
      'data-retention-email-panel="draft" class="flex min-w-0 flex-col gap-2.5 border-t',
    );
    // Draft body may still mention the quote; only the Evidence well is gone.
    expect(html).toContain("I want to close my account");
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
    // Revising an approved draft still opens Change Decision? dialog.
    expect(html).toContain('aria-haspopup="dialog"');
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
    // Edited is not revise-warn; first click has no confirm Dialog.
    expect(html).not.toContain('aria-haspopup="dialog"');
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
    // Revising a dismissed draft still opens Change Decision? dialog.
    expect(html).toContain('aria-haspopup="dialog"');
  });
});
