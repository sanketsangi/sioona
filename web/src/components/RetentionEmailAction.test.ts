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

import { readFileSync } from "node:fs";

import {
  draftDecisionControlsLocked,
  draftDecisionsDataAttr,
  isReviewActionsCompact,
  queueActionKindForSignal,
  queueActionLabelForSignal,
  RetentionEmailAction,
  RetentionEmailDecisionControlsFrame,
  retentionHeaderChipStatus,
  REVIEW_ACTIONS_LABELED_MIN_PX,
} from "@/components/RetentionEmailAction";
import { GEIST_MASK_SVG } from "@/components/icons/geist-mask-svg";
import {
  createRetentionEmailAction,
  createSupervisedDraftAction,
} from "@/lib/supervised-actions";
import type { Signal } from "@/lib/types";

/** Toolbar decision button whose visible label is exactly `label`. */
function decisionButtonMarkup(html: string, label: string): string {
  const matches = html.match(/<button\b[^>]*>[\s\S]*?<\/button>/g) ?? [];
  const button = matches.find(
    (markup) =>
      markup.includes(`aria-label="${label}"`) &&
      markup.includes(`review-action-label`),
  );
  expect(button, label).toBeTruthy();
  return button ?? "";
}

function expectDraftDecisionIcons(html: string) {
  const approve = decisionButtonMarkup(html, "Approve draft");
  const edit = decisionButtonMarkup(html, "Edit Draft");
  const dismiss = decisionButtonMarkup(html, "Dismiss");

  expect(approve).toContain('data-icon="inline-start"');
  expect(approve).toContain("size-3.5");
  expect(approve).toContain(
    encodeURIComponent(GEIST_MASK_SVG["/icons/check-circle.svg"]),
  );
  expect(approve).not.toContain(
    encodeURIComponent(GEIST_MASK_SVG["/icons/good.svg"]),
  );
  expect(approve).not.toContain(
    encodeURIComponent(GEIST_MASK_SVG["/icons/cross-circle.svg"]),
  );

  expect(edit).toContain('data-icon="inline-start"');
  expect(edit).toContain('class="size-3.5 shrink-0"');

  expect(dismiss).toContain('data-icon="inline-start"');
  expect(dismiss).toContain("size-3.5");
  expect(dismiss).toContain(
    encodeURIComponent(GEIST_MASK_SVG["/icons/cross-circle.svg"]),
  );
  expect(dismiss).not.toContain(
    encodeURIComponent(GEIST_MASK_SVG["/icons/good.svg"]),
  );
  expect(dismiss).not.toContain(
    encodeURIComponent(GEIST_MASK_SVG["/icons/check-circle.svg"]),
  );

  expect(html.indexOf(approve)).toBeLessThan(html.indexOf(edit));
  expect(html.indexOf(edit)).toBeLessThan(html.indexOf(dismiss));
}

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

  it("returns Review for a pending lead, upsell, or lower-confidence retention", () => {
    expect(
      queueActionLabelForSignal(
        signal({ type: "lead", confidence: 0.95, score: 0.95 }),
        "Rahul",
      ),
    ).toBe("Review");
    expect(
      queueActionLabelForSignal(
        signal({ type: "upsell", confidence: 0.4, score: 0.4 }),
        "Rahul",
      ),
    ).toBe("Review");
    expect(
      queueActionLabelForSignal(
        signal({ type: "retention", confidence: 0.74, score: 0.74 }),
        "Priya",
      ),
    ).toBe("Review");
    expect(
      queueActionKindForSignal(
        signal({ type: "retention", confidence: 0.75, score: 0.75 }),
        "Priya",
      ),
    ).toBe("approve");
  });

  it("returns Review when the stored draft is not a high-confidence retention email", () => {
    const lead = signal({ type: "lead", confidence: 0.95, score: 0.95 });
    const stored = createSupervisedDraftAction({
      signal: lead,
      customerName: "Rahul",
      evidence: lead.evidence,
    });
    expect(stored?.type).toBe("lead_outreach_draft");
    expect(stored?.status).toBe("pending");
    expect(queueActionLabelForSignal(lead, "Rahul", stored)).toBe("Review");
  });

  it("returns Mark as Acted on the Follow-up list", () => {
    const correct = signal({
      status: "reviewed",
      feedback: {
        label: "correct",
        reviewedAt: "2026-09-03T00:00:00.000Z",
      },
    });
    expect(queueActionLabelForSignal(correct, "Priya")).toBe("Mark as Acted");
    expect(queueActionLabelForSignal(correct, "Priya", null, "list")).toBe(
      "Mark as Acted",
    );
  });

  it("returns Acted on the open review row", () => {
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
        null,
        "review",
      ),
    ).toBe("Acted");
  });

  it("returns the stored retention decision instead of Approve", () => {
    for (const status of ["approved", "edited", "dismissed"] as const) {
      const stored = {
        ...createRetentionEmailAction({
          signal: signal(),
          customerName: "Priya",
        }),
        status,
      };
      const label =
        status === "approved"
          ? "Approved"
          : status === "edited"
            ? "Edited"
            : "Dismissed";
      expect(queueActionLabelForSignal(signal(), "Priya", stored)).toBe(label);
      expect(queueActionKindForSignal(signal(), "Priya", stored)).toBe(status);
    }
  });

  it("keeps Approve when the stored draft has no decision", () => {
    const stored = createRetentionEmailAction({
      signal: signal(),
      customerName: "Priya",
    });
    expect(stored.status).toBe("pending");
    expect(queueActionLabelForSignal(signal(), "Priya", stored)).toBe(
      "Approve",
    );
  });

  it("keeps Follow-up Mark as Acted and Done Marked as Acted over a decision", () => {
    const stored = {
      ...createRetentionEmailAction({
        signal: signal(),
        customerName: "Priya",
      }),
      status: "approved" as const,
    };
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
        stored,
      ),
    ).toBe("Mark as Acted");
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
        stored,
        "review",
      ),
    ).toBe("Marked as Acted");
  });

  it("returns Marked as Acted for acted Done rows", () => {
    const acted = signal({
      status: "acted",
      feedback: {
        label: "correct",
        reviewedAt: "2026-09-03T00:00:00.000Z",
      },
    });
    expect(queueActionLabelForSignal(acted, "Priya")).toBe("Marked as Acted");
    expect(queueActionLabelForSignal(acted, "Priya", null, "review")).toBe(
      "Marked as Acted",
    );
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

  it("uses Review for lead, upsell, and lower-confidence retention", () => {
    expect(
      queueActionKindForSignal(
        signal({ type: "lead", confidence: 0.95, score: 0.95 }),
        "Rahul",
      ),
    ).toBe("review");
    expect(
      queueActionKindForSignal(
        signal({ type: "upsell", confidence: 0.55, score: 0.55 }),
        "Rahul",
      ),
    ).toBe("review");
    expect(
      queueActionKindForSignal(
        signal({ type: "retention", confidence: 0.4, score: 0.4 }),
        "Priya",
      ),
    ).toBe("review");
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

describe("draftDecisionControlsLocked", () => {
  it("locks draft CTAs while the Edit Draft dialog is open", () => {
    expect(draftDecisionControlsLocked(false)).toBe(false);
    expect(draftDecisionControlsLocked(true)).toBe(true);
  });
});

describe("retentionHeaderChipStatus", () => {
  it("prefers live Approve / Dismiss over the stale supervised prop", () => {
    expect(retentionHeaderChipStatus("pending", "approved")).toBe("approved");
    expect(retentionHeaderChipStatus("pending", "dismissed")).toBe("dismissed");
    expect(retentionHeaderChipStatus("approved", null)).toBe("approved");
    expect(retentionHeaderChipStatus(null, null)).toBe(null);
  });
});

describe("RetentionEmailDecisionControlsFrame", () => {
  it("marks the Edit Draft decision group inert when locked", () => {
    const locked = renderToStaticMarkup(
      createElement(
        RetentionEmailDecisionControlsFrame,
        { locked: true },
        createElement("button", { type: "button" }, "Approve Draft"),
      ),
    );
    const open = renderToStaticMarkup(
      createElement(
        RetentionEmailDecisionControlsFrame,
        { locked: false },
        createElement("button", { type: "button" }, "Approve Draft"),
      ),
    );

    expect(draftDecisionsDataAttr(true)).toBe("locked");
    expect(draftDecisionsDataAttr(false)).toBe("open");
    expect(locked).toContain('data-draft-decisions="locked"');
    expect(locked).toContain("inert");
    expect(open).toContain('data-draft-decisions="open"');
    expect(open).not.toContain("inert");
  });
});

describe("review actions toolbar density", () => {
  it("hides Approve, Edit Draft, and Dismiss below 424px and leaves Run Actions labeled", () => {
    expect(REVIEW_ACTIONS_LABELED_MIN_PX).toBe(424);
    expect(isReviewActionsCompact(334)).toBe(true);
    expect(isReviewActionsCompact(423)).toBe(true);
    expect(isReviewActionsCompact(424)).toBe(false);
    expect(isReviewActionsCompact(845)).toBe(false);
    const css = readFileSync(
      new URL("../app/globals.css", import.meta.url),
      "utf8",
    );
    expect(css).toContain("@container retention-email (width < 424px)");
    expect(css).toContain(
      '[data-review-actions-toolbar="true"] button:has(.review-action-label)',
    );
    expect(css).toContain(
      '[data-review-actions-toolbar="true"] .review-action-label',
    );
    expect(css).toContain("flex-wrap: nowrap");
    const narrowRule = css.slice(
      css.indexOf("@container retention-email (width < 424px)"),
    );
    expect(narrowRule).not.toContain("Run Actions");
  });
});

describe("RetentionEmailAction", () => {
  it("shows evidence with toolbar Edit Draft (no inline draft well)", () => {
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
    expect(html).not.toContain("Approve Draft");
    expect(html).not.toContain("Approve &amp; Send");
    expect(html).toContain(">Approve draft<");
    expect(html).toContain("Edit Draft");
    expect(html).toContain(">Dismiss<");
    expectDraftDecisionIcons(html);
    expect(html).not.toContain("Dismiss Draft");
    expect(html).toContain("Evidence");
    expect(html).toContain("I want to close my account");
    expect(html).not.toContain('data-retention-email-panel="draft"');
    expect(html).not.toContain(">Draft<");
    expect(html).toContain("retention-email-columns");
    expect(html).toContain('data-draft-decisions="open"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Save Edit");
    expect(html).not.toContain("retention-email-draft-swap");
    expect(html).not.toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
    );
    expect(html).toContain("flex flex-wrap items-center justify-end gap-1");
    expect(html).toContain('data-review-actions-toolbar="true"');
    expect(html).toContain('aria-label="Retention email actions"');
    expect(html).toContain(
      "btn-secondary h-9 min-h-9 shrink-0 touch-manipulation gap-1.5 px-2.5",
    );
    expect(html).toContain("Sioona never sends or CRM-tags");
    expect(html).toContain("data-review-slot=\"retention-email\"");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain(
      "truncate text-heading-14 font-medium text-sio-fg-base",
    );
    expect(html).toContain('data-slot="card"');
    // Toolbar Edit Draft comes after helper copy, before Evidence.
    expect(html.indexOf("High-confidence retention draft")).toBeLessThan(
      html.indexOf("Edit Draft"),
    );
    expect(html.indexOf("Edit Draft")).toBeLessThan(html.indexOf("Evidence"));
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
    expect(html).toContain('data-retention-border="quiet"');
    expect(html).toContain("mx-3");
    expect(html).toContain("mb-3");
    expect(html).toContain("mt-3");
    expect(html).toContain("gap-2");
    expect(html).not.toContain("ps-6");
    expect(html).toContain("border-sio-border-subtle");
    expect(html).toContain("gap-1.5");
    expect(html).toContain("retention-email-columns");
    expect(html).toContain("flex flex-wrap items-center justify-end gap-1");
    expect(html).not.toContain("flex-nowrap");
    expect(html).not.toContain(
      "lg:grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)]",
    );
    expect(html).toContain("Retention Email");
    expect(html).not.toContain("bg-sio-bg-muted text-sio-fg-muted");
    expect(html).not.toContain("Approve Draft");
    expect(html).toContain("Edit Draft");
    expect(html).toContain("High-confidence retention draft");
    expect(html).toContain("Evidence");
    expect(html).not.toContain('data-retention-email-panel="draft"');
    expect(html).not.toContain(">Draft<");
    // Title row is title + icon only — Edit Draft is in the bottom toolbar.
    expect(html).not.toContain(
      "relative z-[1] flex min-w-0 items-center justify-between gap-2",
    );
    expect(html).toContain('data-review-actions-toolbar="true"');
    expect(html.indexOf("Edit Draft")).toBeLessThan(html.indexOf("Evidence"));
    expect(html.indexOf("High-confidence retention draft")).toBeLessThan(
      html.indexOf("Edit Draft"),
    );
    expect(html).toContain("rounded-[var(--radius-control)]");
    expect(html).not.toContain("rounded-full");
    expect(html).toContain(
      "text-label-12 leading-5 font-semibold tracking-normal text-sio-fg-subtle",
    );
    expect(html).toContain("<h3");
    expect(html).toContain(
      "min-w-0 flex-1 truncate text-heading-14 font-medium text-sio-fg-base",
    );
    expect(html).toContain("[mask-image:var(--geist-icon)]");
    expect(html).toContain("size-4 shrink-0 text-sio-fg-base");
    expect(html).not.toContain('data-slot="card"');
    expect(html).not.toContain("data-slot=\"separator\"");
    expect(html).not.toContain("border-b border-sio-border-base");
    expect(html).not.toContain('data-slot="label"');
  });

  it("renders Edit Draft before embedded Run Actions in the toolbar", () => {
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
        embeddedActions: createElement(
          "button",
          { type: "button", "aria-label": "Run Actions" },
          "Run Actions",
        ),
      }),
    );

    expect(html).toMatch(
      /High-confidence retention draft[\s\S]*data-review-actions-toolbar="true"[\s\S]*Edit Draft[\s\S]*Run Actions[\s\S]*Evidence/,
    );
    expect(html.indexOf("High-confidence retention draft")).toBeLessThan(
      html.indexOf('data-review-actions-toolbar="true"'),
    );
    expect(html.indexOf("Edit Draft")).toBeLessThan(
      html.indexOf('aria-label="Run Actions"'),
    );
    expect(html.indexOf('data-review-actions-toolbar="true"')).toBeLessThan(
      html.indexOf("Evidence"),
    );
  });

  it("keeps a quiet draft surface after approval with Edit Draft", () => {
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
        embedded: true,
      }),
    );

    expect(html).toContain('data-retention-border="quiet"');
    expect(html).toContain("Edit Draft");
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
    expect(html).not.toContain("Approve Draft");
    expect(html).toContain("Edit Draft");
    expect(html).toContain(">Dismiss<");
    expect(html).not.toContain('data-retention-email-panel="draft"');
    expect(html).not.toContain('data-retention-email-panel="evidence"');
    expect(html).not.toContain('<span>Evidence</span>');
    expect(html).not.toContain("retention-email-columns");
  });

  it("shows a lead outreach draft without a stored action", () => {
    const html = renderToStaticMarkup(
      createElement(RetentionEmailAction, {
        signal: signal({ type: "lead", confidence: 0.95, score: 0.95 }),
        customerName: "Rahul",
      }),
    );
    expect(html).toContain("Lead Outreach");
    expect(html).toContain(">Approve draft<");
    expect(html).toContain("Edit Draft");
    expect(html).toContain(">Dismiss<");
    expect(html).not.toContain("Retention Email");
  });

  it("keeps Edit Draft after Approved so partners can revise", () => {
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
    expect(html).not.toContain("Approve Draft");
    expect(html).toContain("Edit Draft");
    expect(html).toContain(">Dismiss<");
    expect(html).not.toContain("This draft already has a decision.");
  });

  it("keeps Edit Draft after an edited draft save", () => {
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
    expect(html).not.toContain("Approve Draft");
    expect(html).toContain("Edit Draft");
    expect(html).toContain(">Dismiss<");
    // Body lives in Edit Draft dialog only — not an inline preview.
    expect(html).not.toContain("Revised retention note.");
  });

  it("keeps Edit Draft after a prior Dismissed status", () => {
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
    expect(html).not.toContain("Approve Draft");
    expect(html).toContain("Edit Draft");
    expect(html).toContain(">Dismiss<");
  });

  it("names lead, follow-up, and upsell drafts", () => {
    const cases = [
      {
        type: "lead" as const,
        confidence: 0.8,
        title: "Lead Outreach",
        pending: "Lead Outreach draft.",
      },
      {
        type: "retention" as const,
        confidence: 0.4,
        title: "Retention Follow-up",
        pending: "Retention Follow-up draft.",
      },
      {
        type: "upsell" as const,
        confidence: 0.55,
        title: "Upsell Note",
        pending: "Upsell Note draft.",
      },
    ];
    for (const item of cases) {
      const row = signal({
        type: item.type,
        confidence: item.confidence,
        score: item.confidence,
      });
      const html = renderToStaticMarkup(
        createElement(RetentionEmailAction, {
          signal: row,
          customerName: "Priya",
          embedded: true,
        }),
      );
      expect(html).toContain(item.title);
      expect(html).toContain(item.pending);
      expect(html).toContain(">Approve draft<");
      expect(html).toContain("Edit Draft");
      expect(html).toContain(">Dismiss<");
      expectDraftDecisionIcons(html);
      expect(html).not.toContain("Best regards");
    }
  });
});
