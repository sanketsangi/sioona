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
  it("splits Recommended Actions and Why This Fired into sibling wells", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        customerName: "Priya",
        className: "insights-review-pane insights-review-well overflow-hidden",
      }),
    );

    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Matched");
    expect(html).toContain(
      "Hi Priya — I saw your note about “Please pause my SIP this month”. I can look into this and call you today if helpful. When works for a quick chat?",
    );
    expect(html).toContain("Copy Reply");
    expect(html).toContain("Copied…");
    expect(html).toContain("Copy reply to clipboard");
    expect(html).toContain('aria-label="Mark as Acted"');
    expect(html).toContain('aria-label="Reply actions"');
    expect(html).toContain('data-review-actions-toolbar="true"');
    expect(html).toContain('data-review-actions-footer="true"');
    expect(html).toContain("justify-end");
    expect(html).toContain("w-full shrink-0 flex-wrap items-center justify-end gap-2");
    expect(html).toContain('class="sr-only"');
    expect(html).not.toContain("Recommended reply");
    expect(html).toContain("btn-secondary shrink-0");
    expect(html).toContain("active:translate-y-0");
    expect(html).toContain(
      "relative inline-grid size-3.5 shrink-0 place-items-center",
    );
    expect(html).toContain("relative inline-grid justify-items-center text-center");
    expect(html).toContain('data-variant="outline"');
    expect(html).not.toContain('data-copied="true"');
    expect(html).toMatch(
      /Recommended Actions[\s\S]*Hi Priya[\s\S]*Copy Reply[\s\S]*Mark as Acted/,
    );
    expect(html).toMatch(
      /Hi Priya — I saw your note about[\s\S]*Copy Reply/,
    );
    expect(html).not.toMatch(
      /Recommended Actions[\s\S]*Copy Reply[\s\S]*Hi Priya/,
    );
    expect(html).toContain("M2.75 0.5C1.7835 0.5");
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("aria-live");
    expect(html).not.toContain('disabled=""');
    expect(html).toContain("Please pause my SIP this month");
    expect(html).toContain("Phrase");
    expect(html).toContain("pause my SIP");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("text-copy-16");
    expect(html).toContain(
      "break-words text-pretty text-copy-16 text-sio-fg-base",
    );
    expect(html).toContain("Mark as Acted");
    // Pending Feedback: Acted is secondary until Correct unlocks primary.
    expect(html).toContain("btn-secondary shrink-0");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("Label in Feedback first");
    expect(html).not.toContain("status-dot");
    expect(html).toContain("border-b border-sio-border-base");
    expect(html).toContain("flex min-w-0 flex-wrap items-center justify-between");
    expect(html).toContain(
      'truncate text-label-14 font-semibold leading-5 tracking-normal text-sio-fg-base',
    );
    expect(html).toContain("flex shrink-0 items-center");
    expect(html).toContain(
      "w-full shrink-0 flex-wrap items-center justify-end gap-2",
    );
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
    expect(html.match(/data-slot="card"/g)?.length).toBe(2);
    expect(html).toContain('data-review-slot="actions"');
    expect(html).toContain('data-review-slot="why"');
    expect(html).toContain("data-slot=\"separator\"");
    expect(html).toContain("insights-review-well");
    expect(html).not.toContain("xl:grid-cols-2");
    expect(html).not.toContain("bg-sio-bg-muted/50");
    expect(html.match(/insights-review-well/g)?.length).toBe(2);
    expect(html).toContain("justify-center gap-1.5 py-3");
    expect(html).toContain('data-slot="label"');
    expect(html).not.toContain("border-l-2");
    expect(html).toContain("M14.5 8C14.5 11.5899");
    expect(html).toContain('fill="currentColor"');
    expect(html).not.toContain('fill="#666666"');
    expect(html).toContain("flex min-w-0 items-center gap-2");
    expect(html).toContain("“Please pause my SIP this month”");
    expect(html).toContain('data-pill-background="true"');
    expect(html).toContain("rounded-[10ex]");
    expect(html).toContain("outline-dashed");
    expect(html).toContain(
      "relative flex h-8 max-w-full flex-row items-center gap-1.5 rounded-[10ex] px-3 text-label-14",
    );
    expect(html).not.toContain("min-h-11 max-w-full flex-row");
    // WhyQuote: h-9 control chrome + shared radius (not min-h-11 / py-2 padding).
    expect(html).toContain(
      "h-9 w-full rounded-[var(--radius-control)] border border-border",
    );
    expect(html).toContain(
      "h-9 w-full rounded-[var(--radius-control)] border border-border bg-sio-bg-base px-3 text-left font-normal",
    );
    expect(html).not.toContain("evidence-highlight");
    expect(html).not.toContain("min-h-11 justify-start");
    expect(html).not.toContain("lg:min-h-9");
    expect(html).not.toContain("h-auto w-full rounded-[var(--radius-control)]");
    expect(html).not.toContain("line-clamp-2");
    // Retention Email stays on Recommended Actions; Why This Fired is a sibling well.
    expect(html).toMatch(
      /Recommended Actions[\s\S]*Retention Email[\s\S]*Why This Fired[\s\S]*Matched[\s\S]*pause my SIP/,
    );
    expect(html).toContain('data-review-slot="retention-email"');
    expect(html).toContain("Approve Draft");
    const retentionIdx = html.indexOf("Retention Email");
    const matchedIdx = html.indexOf("Matched");
    expect(retentionIdx).toBeGreaterThan(-1);
    expect(matchedIdx).toBeGreaterThan(-1);
    expect(retentionIdx).toBeLessThan(matchedIdx);
  });

  it("nests Retention Email inside Recommended Actions, before Why This Fired", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        customerName: "Priya",
      }),
    );

    expect(html.match(/data-slot="card"/g)?.length).toBe(2);
    expect(html).toContain("Recommended Actions");
    expect(html).toMatch(
      /Recommended Actions[\s\S]*Retention Email[\s\S]*Approve Draft[\s\S]*Why This Fired/,
    );
    expect(html.indexOf("Retention Email")).toBeLessThan(
      html.indexOf("Approve Draft"),
    );
    expect(html.indexOf("Approve Draft")).toBeLessThan(
      html.indexOf("Why This Fired"),
    );
    expect(html).toContain('data-review-slot="retention-email"');
    expect(html).not.toContain("insights-review-pane insights-review-well");
    // Actions + Why pane headers.
    expect(html.match(/border-b border-sio-border-base/g)?.length).toBe(2);
    expect(html).toContain("surface-quiet");
    // Pending chip lives on Recommended Actions header (not Retention Email).
    expect(html).toMatch(
      /Recommended Actions[\s\S]*Pending[\s\S]*data-review-slot="retention-email"/,
    );
    expect(html).toMatch(
      /data-review-slot="retention-email"[\s\S]*<h3[\s\S]*Retention Email/,
    );
    expect(html).not.toMatch(
      /data-review-slot="retention-email"[\s\S]*Pending[\s\S]*Approve Draft/,
    );
    expect(html).toContain(
      "min-w-0 flex-1 truncate text-label-14 font-semibold leading-5 tracking-normal text-sio-fg-base",
    );
    // Why / Matched stay Label density.
    expect(html).toContain(
      "leading-5 font-medium tracking-normal text-sio-fg-subtle",
    );
    // Why This Fired owns the quote — no duplicate Retention Evidence well.
    expect(html).toContain("Why This Fired");
    expect(html).toContain("“Please pause my SIP this month”");
    expect(html).not.toContain('data-retention-email-panel="evidence"');
    expect(html).toContain('data-retention-email-panel="draft"');
    expect(html).toContain("Approve Draft");
  });

  it("keeps Retention Email Evidence when Why is hidden (matches only)", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: ['phrase: "pause my SIP"'],
        }),
        customerName: "Priya",
      }),
    );

    expect(html).not.toContain("Why This Fired");
    expect(html).toContain("Matched");
    expect(html).toContain("Retention Email");
    expect(html).toContain('data-retention-email-panel="evidence"');
    expect(html).toContain("No local evidence quote.");
    expect(html).toContain('data-retention-email-panel="draft"');
    expect(html).toContain("Approve Draft");
  });

  it("omits Retention Email for non-retention signals", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({ type: "lead", confidence: 0.95 }),
        customerName: "Rahul",
      }),
    );

    expect(html).toContain("Recommended Actions");
    expect(html).not.toContain("Retention Email");
    expect(html).not.toContain('data-review-slot="retention-email"');
  });

  it("omits Matched section when only quotes exist", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          evidence: ['quote: "Please pause my SIP this month"'],
        }),
        customerName: "Priya",
      }),
    );

    expect(html).toContain("Why This Fired");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).not.toContain("Matched");
    // Screenshot case: one quote under Why — not again under Retention Evidence.
    expect(html).not.toContain('data-retention-email-panel="evidence"');
    expect(html).toContain('data-retention-email-panel="draft"');
    expect(html).toContain("Approve Draft");
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
    // Matched-only well — no Why|Matched separator.
    expect(html).not.toContain('data-slot="separator"');
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
    // Why|Matched separator only — Retention Email nests as surface-quiet.
    expect(html.match(/data-slot="separator"/g)?.length).toBe(1);
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
    expect(html).toContain('data-size="lg"');
    expect(html).not.toContain("border-l-2");
    expect(html).toContain("M14.5 8C14.5 11.5899");
    expect(html).toContain('fill="currentColor"');
    expect(html).toContain("“Please pause my SIP this month”");
    // Active merges border-transparent over border-border — still h-9 chrome.
    expect(html).toContain(
      "h-9 w-full rounded-[var(--radius-control)] border px-3 text-left font-normal evidence-highlight border-transparent",
    );
    // Mobile hit expand — chrome stays h-9 (not taller min-h-11).
    expect(html).toContain("before:-inset-y-1 before:inset-x-0");
    expect(html).toContain("md:before:hidden");
    expect(html).not.toContain("min-h-11 justify-start");
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

    expect(html).toContain("No recommended reply");
    expect(html).not.toContain("Unavailable — local detection join missing.");
    expect(html).toContain("No local evidence.");
    expect(html).toContain("Copy Reply");
    expect(html).toContain("Copy reply to clipboard");
    expect(html).toContain('disabled=""');
    expect(html).toContain(
      "break-words text-pretty text-copy-16 text-sio-fg-muted",
    );
    expect(html).toMatch(
      /Recommended Actions[\s\S]*No recommended reply[\s\S]*Copy Reply/,
    );
  });

  it("shows skeleton and disables Copy + Acted while the draft is loading", () => {
    const html = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        customerName: "Priya",
        draftLoading: true,
      }),
    );

    expect(html).toContain('data-review-reply-skeleton="true"');
    expect(html).toContain("Loading recommended reply");
    expect(html).toContain('data-slot="skeleton"');
    expect(html).not.toContain("Hi Priya — I saw your note about");
    expect(html).not.toContain("No recommended reply");
    expect(html).toContain("Copy Reply");
    expect(html).toContain("Mark as Acted");
    // Both CTAs disabled until draft ready.
    expect(html.match(/disabled=""/g)?.length).toBeGreaterThanOrEqual(2);
    expect(html).toContain('aria-busy="true"');
  });

  it("keeps Correct-before-Acted gate and promotes Acted only on Correct", () => {
    const pending = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal(),
        customerName: "Priya",
      }),
    );
    expect(pending).toContain('aria-haspopup="dialog"');
    expect(pending).toContain("Label in Feedback first");
    // Pending: secondary Acted (Copy is also secondary).
    expect(pending).toContain("btn-secondary");
    // Mark as Acted button itself is secondary (btn-primary may appear on Retention Approve).
    expect(pending).toMatch(
      /class="[^"]*btn-secondary[^"]*"[^>]*aria-label="Mark as Acted"/,
    );

    const incorrect = renderToStaticMarkup(
      createElement(SignalReviewSuggestedAction, {
        signal: signal({
          status: "reviewed",
          feedback: {
            label: "incorrect",
            reviewedAt: "2026-08-02T00:00:00.000Z",
          },
        }),
        customerName: "Priya",
      }),
    );
    expect(incorrect).toContain('aria-haspopup="dialog"');
    expect(incorrect).toContain(
      "Update Feedback to Correct to unlock Mark as Acted",
    );
    expect(incorrect).toMatch(
      /class="[^"]*btn-secondary[^"]*"[^>]*aria-label="Mark as Acted"/,
    );

    const correct = renderToStaticMarkup(
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
    expect(correct).toContain("btn-primary shrink-0");
    expect(correct).toMatch(
      /class="[^"]*btn-primary shrink-0[^"]*"[^>]*aria-label="Mark as Acted"/,
    );
    // Correct path: Mark as Acted has no gate dialog (Retention Approve may still).
    expect(correct).toMatch(
      /aria-keyshortcuts="A Enter" aria-label="Mark as Acted"/,
    );
    expect(correct).not.toMatch(
      /aria-haspopup="dialog"[^>]*aria-label="Mark as Acted"|aria-label="Mark as Acted"[^>]*aria-haspopup="dialog"/,
    );
    expect(correct).not.toContain("Label in Feedback first");
    expect(correct).not.toContain("Update Feedback to Correct to unlock");
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
    expect(html).toContain("No recommended reply");
  });

  it("keeps Copy Reply after Acted with disabled Marked as Acted", () => {
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

    expect(html).toContain("Marked as Acted");
    expect(html).toContain('aria-pressed="true"');
    expect(html).toContain("disabled:opacity-100");
    expect(html).toContain('aria-label="Marked as Acted"');
    expect(html).not.toContain(
      "Marked as Acted — run it in your tools; Sioona never sends or CRM-tags.",
    );
    expect(html).not.toContain("Mark as Acted");
    expect(html).not.toContain('aria-keyshortcuts="A Enter"');
    expect(html).not.toContain("status-dot");
    expect(html).toContain(
      "Hi Priya — I saw your note about “Please pause my SIP this month”. I can look into this and call you today if helpful. When works for a quick chat?",
    );
    expect(html).toContain("Copy Reply");
  });

  it("puts Mark as Acted in the footer and omits the Correct chip", () => {
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
      /Recommended Actions[\s\S]*Hi Priya — I saw your note about[\s\S]*Copy Reply[\s\S]*Mark as Acted/,
    );
    expect(html).toMatch(
      /Hi Priya — I saw your note about[\s\S]*Copy Reply/,
    );
    expect(html).toContain("Copy Reply");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("btn-secondary shrink-0");
    expect(html).toContain("btn-primary shrink-0");
    expect(html).toContain("aria-keyshortcuts");
    expect(html).not.toContain("bg-sio-status-success-bg");
    expect(html).not.toContain("status-dot");
    expect(html).not.toContain("A / Enter → Mark as Acted.");
  });

  it("shows Mark as Acted without walk context until the review is Acted", () => {
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

    expect(html).toContain("Mark as Acted");
    expect(html).toContain("btn-primary shrink-0");
  });
});
