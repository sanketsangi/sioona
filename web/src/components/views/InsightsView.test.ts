import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreData, Signal } from "@/lib/types";
import type { BackendSignalScore } from "@/lib/backend-client";

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

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/",
}));

import { applySupervisedDecisionOverlay } from "@/lib/supervised-action-persistence";
import type { BackendSupervisedActionDecision } from "@/lib/backend-client";
import { InsightsView } from "./InsightsView";
import { RevenueLeakReportView } from "./RevenueLeakReportView";
import {
  queueSignalsForFilter,
  shuffleSignals,
} from "@/lib/join-needs-review";

function makePendingSignals(count: number): Signal[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `sig_${i + 1}`,
    tenantId: "tenant_demo",
    conversationId: `conv_${i + 1}`,
    type: "lead" as const,
    score: 0.9,
    confidence: 0.9,
    summary: `Pending signal ${i + 1}`,
    suggestedAction: "Follow up",
    evidence: ["quote"],
    status: "new" as const,
    createdAt: "2026-08-01T00:00:00.000Z",
    backendSignalId: `pred-${i + 1}`,
  }));
}

function storeFromSignals(signals: Signal[]): StoreData {
  return {
    tenant: {
      id: "tenant_demo",
      name: "Demo",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    conversations: signals.map((s) => ({
      id: s.conversationId,
      tenantId: "tenant_demo",
      channel: "whatsapp" as const,
      startedAt: "2026-08-01T00:00:00.000Z",
      messageIds: [],
      customerName: `Customer ${s.conversationId}`,
    })),
    messages: [],
    signals,
    pilot: { baselineOpportunities: 12, weeklyExportCount: 4 },
  };
}

const cadenceReviews = {
  id: "reviews" as const,
  label: "Mark ≥5 Corrects this window",
};

const cadenceMidweek = {
  id: "midweek" as const,
  label: "Mid-week — Re-upload weekly export",
};

const emptyWindowScore: BackendSignalScore = {
  tenant_id: "tenant_demo",
  reviewed_count: 0,
  correct_count: 0,
  incorrect_count: 0,
  partially_correct_count: 0,
  signal_score: 0,
  by_signal_type: [],
};

const goWindowScore: BackendSignalScore = {
  tenant_id: "tenant_demo",
  reviewed_count: 6,
  correct_count: 5,
  incorrect_count: 1,
  partially_correct_count: 0,
  signal_score: 0.83,
  by_signal_type: [],
};

function renderPendingList(
  backendScore: BackendSignalScore | null,
  scoreUnavailable = false,
) {
  const pending = makePendingSignals(3);
  const store = storeFromSignals(pending);
  return renderToStaticMarkup(
    createElement(InsightsView, {
      store,
      statusFilter: "new",
      typeFilter: "all",
      page: 1,
      backendScore,
      needsReview: {
        ok: true,
        predictions: pending.map((s) => ({
          id: s.backendSignalId!,
          tenant_id: "tenant_demo",
          conversation_id: s.conversationId,
          signal_type: s.type,
          confidence: s.score,
          summary: s.summary,
          created_at: s.createdAt,
        })),
      },
      tenantSignals: { ok: true, rows: [] },
      cadenceAction: cadenceReviews,
      scoreUnavailable,
    }),
  );
}

function renderPendingPreview(opts: {
  count: number;
  previewId: string;
  scoreFrom?: string;
  jsonKeepSet?: boolean;
  actionFilter?: "all" | "approve" | "review";
  typeFilter?: "all" | "lead" | "retention" | "upsell";
  signals?: Signal[];
}) {
  const pending = opts.signals ?? makePendingSignals(opts.count);
  const store = storeFromSignals(pending);
  return renderToStaticMarkup(
    createElement(InsightsView, {
      store,
      statusFilter: "new",
      typeFilter: opts.typeFilter ?? "all",
      actionFilter: opts.actionFilter ?? "all",
      page: 1,
      previewId: opts.previewId,
      scoreFrom: opts.scoreFrom,
      jsonKeepSet: opts.jsonKeepSet,
      needsReview: {
        ok: true,
        predictions: pending.map((s) => ({
          id: s.backendSignalId!,
          tenant_id: "tenant_demo",
          conversation_id: s.conversationId,
          signal_type: s.type,
          confidence: s.confidence ?? s.score,
          summary: s.summary,
          created_at: s.createdAt,
        })),
      },
      tenantSignals: { ok: true, rows: [] },
      cadenceAction: cadenceReviews,
    }),
  );
}

describe("InsightsView window n / ≥5 footer", () => {
  it("empty Neon window shows 0 / ≥5 toward ≥80% Go without labeled P/R", () => {
    const html = renderPendingList(emptyWindowScore);

    expect(html).toContain("Review 5 chats this week");
    expect(html).not.toMatch(/\d+\/\d+ correct/);
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toContain("Labeled Eval");
    expect(html).not.toContain("Precision By Signal Type");
    expect(html).not.toMatch(/>Go</);
    expect(html).not.toMatch(/>Hold</);
  });

  it("n≥5 window shows n / ≥5 and correct/reviewed without labeled P/R", () => {
    const html = renderPendingList(goWindowScore);

    expect(html).toContain("This week 6 of 5 reviews · 5/6 correct");
    expect(html).not.toContain("Review 5 chats this week");
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toContain("Labeled Eval");
    expect(html).not.toContain("Precision By Signal Type");
    expect(html).not.toMatch(/>Go</);
    expect(html).not.toMatch(/>Hold</);
    // Visible Signal Score (not a coincidence in inlined SVG path data).
    expect(html).not.toMatch(/>83%</);
  });

  it("uses count-SoT correct/reviewed when the week float disagrees", () => {
    const html = renderPendingList({
      ...goWindowScore,
      reviewed_count: 6,
      correct_count: 3,
      incorrect_count: 3,
      signal_score: 1,
    });

    expect(html).toContain("This week 6 of 5 reviews · 3/6 correct");
    expect(html).not.toContain("6/6 correct");
    expect(html).not.toMatch(/>Go</);
    expect(html).not.toMatch(/>100%</);
  });

  it("offline week score keeps the queue and does not invent a ratio or Go", () => {
    const html = renderPendingList(null, true);

    expect(html).toContain('aria-label="Queue metrics"');
    expect(html).toContain("Pending signal 1");
    expect(html).toContain("The weekly score is waiting.");
    expect(html.match(/>Retry</g)).toHaveLength(1);
    expect(html).not.toContain("Retry Queue");
    expect(html).not.toContain("Review 5 chats this week");
    expect(html).not.toContain("of 5 reviews");
    expect(html).not.toMatch(/\d+\/\d+ correct/);
    expect(html).not.toMatch(/>Go</);
    expect(html).not.toMatch(/>Hold</);
  });
});

describe("InsightsView failed second pass", () => {
  it("keeps the heuristic queue and leaves the failure in notifications", () => {
    const pending = makePendingSignals(19);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        newSignalCount: 19,
        llmFailed: 4,
        llmFailure: "model",
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).not.toContain("Second pass failed");
    expect(html).not.toContain("Groq no longer serves this model");
    expect(html).toContain("Pending signal 1");
    expect(html).not.toContain("No signals");
  });

  it("leaves leftover second-pass chats off the landing", () => {
    const pending = makePendingSignals(2);
    const store = storeFromSignals(pending);
    store.llmSkippedConversationIds = Array.from(
      { length: 12 },
      (_, index) => `conv_skip_${index}`
    );
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      })
    );

    expect(html).not.toContain("Second pass has more chats");
    expect(html).not.toContain("12 chats were not classified");
  });
});

describe("InsightsView pending landing empty Follow-up", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists Pending signals under the attention heading when status=new", () => {
    const pending = makePendingSignals(10);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Conversation that needs your attention");
    expect(html).toContain("Shadow Mode — Confirm or correct detections");
    expect(html).toContain("nothing is sent");
    expect(html).toContain('aria-label="Dismiss Shadow Mode tip"');
    expect(html).toContain("Run Partner Demo");
    expect(html).toContain("btn-secondary rounded-[var(--radius-panel)]");
    expect(html).toContain("Queue metrics");
    const titleAt = html.indexOf("Conversation that needs your attention");
    const tipAt = html.indexOf("Shadow Mode — Confirm or correct detections");
    const demoAt = html.indexOf("Run Partner Demo");
    const metricsAt = html.indexOf('aria-label="Queue metrics"');
    const filtersAt = html.indexOf("Add Filter");
    const tableAt = html.indexOf("Pending signal 1");
    expect(titleAt).toBeGreaterThan(-1);
    expect(demoAt).toBeGreaterThan(titleAt);
    expect(tipAt).toBeGreaterThan(titleAt);
    expect(metricsAt).toBeGreaterThan(demoAt);
    expect(metricsAt).toBeGreaterThan(tipAt);
    expect(filtersAt).toBeGreaterThan(metricsAt);
    expect(tableAt).toBeGreaterThan(filtersAt);
    expect(html).toContain("Pending signal 1");
    expect(html).toContain("Pending signal 10");
    expect(html).toContain('data-slot="card"');
    expect(html).toContain("preview=sig_1");
    expect(html).toContain(">Review</a>");
    expect(html).not.toContain(">Approve</a>");
    const reviewAnchors = html.match(/<a\b[^>]*>Review<\/a>/g) ?? [];
    expect(reviewAnchors.length).toBeGreaterThan(0);
    expect(
      reviewAnchors.every(
        (anchor) => anchor.includes("rounded-full") && !anchor.includes("w-7"),
      ),
    ).toBe(true);
    expect(html).toContain("data-queue-card");
    expect(html).toContain("line-clamp-3");
    expect(html).toContain("md:hidden");
    expect(html).toContain("md:block");
    expect(html).toContain('data-queue-preview="true"');
    expect(html).toContain("data-queue-row-link");
    expect(html.match(/id="signal-summary-sig_1"/g)?.length).toBe(1);
    expect(html).not.toContain("Skip pending review");
    expect(html).not.toContain("No Signals Need Follow-Up");
    expect(html).toContain("Add Filter");
    expect(html).toContain('data-slot="popover-trigger"');
    expect(html).toContain("block size-4 shrink-0 text-sio-fg-base");
    expect(html).not.toContain("translate-y-[1.5px]");
    expect(html).toContain("w-[110px]");
    expect(html).toContain("w-16");
    expect(html).toContain("Queue status: All,");
    expect(html).toContain("Queue status: Pending, 10 signals");
    expect(html).toContain("Queue status: Correct,");
    expect(html).toContain("Queue status: Done,");
    expect(html).toContain("Queue action: Approve,");
    expect(html).toContain("Queue action: Review,");
    expect(html).toContain("status=new");
    expect(html).toContain("status=followup");
    expect(html).toContain("status=acted");
    expect(html).toContain("pr-7");
    expect(html).toContain("rounded-[100%]");
    expect(html).toContain("data-filter-count");
    expect(html).toContain(
      "flex min-w-0 flex-row items-center gap-1.5 font-medium leading-none whitespace-nowrap",
    );
    expect(html).toContain("bg-sio-border-base text-sio-fg-base");
    expect(html).toMatch(
      /data-filter-count=""[\s\S]*?<span class="tabular text-label-12 font-medium leading-none"/,
    );
    expect(html).not.toMatch(
      /data-filter-count=""[\s\S]*?translate-y-px tabular/,
    );
    expect(html).toContain("size-6");
    expect(html).toContain("min-w-6 px-1.5");
    expect(html).toContain("gap-2 p-1");
    expect(html).toContain("Clear status filter");
    expect(html).toContain("data-filter-pill-clear");
    expect(html).toContain("data-filter-clear-face");
    expect(html).toContain("rounded-full");
    expect(html).toContain("border-[#ebebeb]");
    expect(html).toContain("text-[#7d7d7d]");
    expect(html).toContain("bg-sio-bg-base");
    expect(html).not.toContain("before:inset-2");
    expect(html).not.toContain("hover:before:block");
    expect(html).not.toContain("Queue type:");
    expect(html).toContain("status-dot");
    expect(html).toContain("status-dot-queued");
    expect(html).not.toContain(">Filters<");
  });

  it("applies Type Lead in Add Filter with X that clears type", () => {
    const pending = makePendingSignals(3);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "lead",
        page: 1,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Queue type: Lead");
    expect(html).toContain("Clear type filter");
    expect(html).toContain("pr-7");
    expect(html).toContain("data-filter-clear-face");
    expect(html).toContain("border-[#ebebeb]");
    expect(html).not.toContain("Add Filter");
    expect(html).not.toContain("w-[110px]");
    const clearType = html.match(
      /href="([^"]*)"[^>]*aria-label="Clear type filter"/,
    )?.[1];
    expect(clearType).toBeDefined();
    expect(clearType).toContain("status=new");
    expect(clearType).not.toContain("type=");
  });

  it("paginates Pending queue at 10 rows with URL page links", () => {
    const pending = makePendingSignals(11);
    const store = storeFromSignals(pending);
    const needsReview = {
      ok: true as const,
      predictions: pending.map((s) => ({
        id: s.backendSignalId!,
        tenant_id: "tenant_demo",
        conversation_id: s.conversationId,
        signal_type: s.type,
        confidence: s.score,
        summary: s.summary,
        created_at: s.createdAt,
      })),
    };
    const page1 = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview,
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(page1).toContain("Pending signal 1");
    expect(page1).toContain("Pending signal 10");
    expect(page1).not.toContain("Pending signal 11");
    expect(page1).toContain("page=2");
    expect(page1).toContain("Page 1 of 2");

    const page2 = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 2,
        needsReview,
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(page2).toContain("Pending signal 11");
    expect(page2).not.toMatch(/Pending signal 1</);
    expect(page2).toContain("Page 2 of 2");
  });

  it("empty Correct with pending shows Review Pending", () => {
    const pending = makePendingSignals(3);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceMidweek,
      }),
    );

    expect(html).toContain("No Correct Signals");
    expect(html).toContain("Review pending detections first.");
    expect(html).toContain("Review Pending");
    expect(html).toContain("status=new");
    expect(html).not.toContain("Upload Weekly Export");
  });

  it("Pending Action shows the stored retention decision chip", () => {
    const decided = makePendingSignals(3).map((row, index) => ({
      ...row,
      type: "retention" as const,
      summary: index === 0 ? "Close account draft" : row.summary,
    }));
    const store = storeFromSignals(decided);
    store.supervisedActions = [
      {
        id: "act_sig_1",
        type: "retention_email_draft",
        signalId: "sig_1",
        conversationId: "conv_1",
        tenantId: "tenant_demo",
        subject: "Your account",
        body: "Hi,",
        generatedSubject: "Your account",
        generatedBody: "Hi,",
        evidenceQuote: "close",
        status: "approved",
        createdAt: "2026-09-03T00:00:00.000Z",
        decidedAt: "2026-09-03T00:00:00.000Z",
      },
      {
        id: "act_sig_2",
        type: "retention_email_draft",
        signalId: "sig_2",
        conversationId: "conv_2",
        tenantId: "tenant_demo",
        subject: "Edited subject",
        body: "Edited body",
        generatedSubject: "Your account",
        generatedBody: "Hi,",
        evidenceQuote: "close",
        status: "edited",
        createdAt: "2026-09-03T00:00:00.000Z",
        decidedAt: "2026-09-03T00:00:00.000Z",
      },
      {
        id: "act_sig_3",
        type: "retention_email_draft",
        signalId: "sig_3",
        conversationId: "conv_3",
        tenantId: "tenant_demo",
        subject: "Your account",
        body: "Hi,",
        generatedSubject: "Your account",
        generatedBody: "Hi,",
        evidenceQuote: "close",
        status: "dismissed",
        createdAt: "2026-09-03T00:00:00.000Z",
        decidedAt: "2026-09-03T00:00:00.000Z",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: decided.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Approved");
    expect(html).toContain("Edited");
    expect(html).toContain("Dismissed");
    expect(html).not.toContain(">Approve</a>");
  });

  it("sig_neon rows show overlaid decisions when JSON has no supervisedActions", () => {
    const specs = [
      {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
        status: "approved" as const,
        subject: "Approved subject",
        body: "Approved body",
      },
      {
        id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
        status: "edited" as const,
        subject: "Edited subject",
        body: "Edited body",
      },
      {
        id: "cccccccc-cccc-4ccc-8ccc-ccccccccccc3",
        status: "dismissed" as const,
        subject: "Dismissed subject",
        body: "Dismissed body",
      },
    ];
    const store = storeFromSignals([]);
    store.signals = [];
    store.supervisedActions = [];
    store.conversations = specs.map((spec, index) => ({
      id: `conv_neon_${index + 1}`,
      tenantId: "tenant_demo",
      channel: "whatsapp" as const,
      startedAt: "2026-08-01T00:00:00.000Z",
      messageIds: [],
      customerName: `Customer ${index + 1}`,
    }));
    const rows: BackendSupervisedActionDecision[] = specs.map((spec, index) => ({
      id: spec.id,
      tenant_id: "tenant_demo",
      conversation_id: `conv_neon_${index + 1}`,
      action_type: "retention_email_draft",
      status: spec.status,
      subject: spec.subject,
      body: spec.body,
      evidence_quote: "close the account",
      created_at: "2026-09-28T00:00:00.000Z",
      decided_at: "2026-09-28T01:00:00.000Z",
    }));
    applySupervisedDecisionOverlay(store, rows);
    expect(store.supervisedActions).toHaveLength(3);
    expect(store.supervisedActions?.[1]?.subject).toBe("Edited subject");
    expect(store.supervisedActions?.[1]?.body).toBe("Edited body");

    const needsReview = {
      ok: true as const,
      predictions: specs.map((spec, index) => ({
        id: spec.id,
        tenant_id: "tenant_demo",
        conversation_id: `conv_neon_${index + 1}`,
        signal_type: "retention" as const,
        confidence: 0.9,
        summary: `${spec.status} retention`,
        created_at: "2026-09-28T00:00:00.000Z",
      })),
    };
    const listHtml = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview,
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(listHtml).toContain(`sig_neon_${specs[0].id}`);
    expect(listHtml).toContain(`sig_neon_${specs[1].id}`);
    expect(listHtml).toContain(`sig_neon_${specs[2].id}`);
    expect(listHtml).toContain("Approved");
    expect(listHtml).toContain("Edited");
    expect(listHtml).toContain("Dismissed");
    expect(listHtml).not.toContain(">Approve</a>");

    const previewHtml = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: `sig_neon_${specs[1].id}`,
        needsReview,
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(previewHtml).toContain(`sig_neon_${specs[1].id}`);
    expect(previewHtml).toContain("Edited");
    expect(previewHtml).toContain("Edited draft saved — not sent.");
  });

  it("Pending Action stays Approve when the retention draft has no decision", () => {
    const pending: Signal = {
      ...makePendingSignals(1)[0],
      type: "retention",
      summary: "Undecided retention",
    };
    const store = storeFromSignals([pending]);
    store.supervisedActions = [
      {
        id: "act_sig_1",
        type: "retention_email_draft",
        signalId: "sig_1",
        conversationId: "conv_1",
        tenantId: "tenant_demo",
        subject: "Your account",
        body: "Hi,",
        generatedSubject: "Your account",
        generatedBody: "Hi,",
        evidenceQuote: "close",
        status: "pending",
        createdAt: "2026-09-03T00:00:00.000Z",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: [
            {
              id: pending.backendSignalId!,
              tenant_id: "tenant_demo",
              conversation_id: pending.conversationId,
              signal_type: pending.type,
              confidence: pending.score,
              summary: pending.summary,
              created_at: pending.createdAt,
            },
          ],
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain(">Approve</a>");
    expect(html).not.toContain(">Review</a>");
    expect(html).not.toContain("Approved");
    expect(html).not.toContain("Edited");
    expect(html).not.toContain("Dismissed");
  });

  it("Action column is Approve only for high-confidence retention", () => {
    const rows: Signal[] = [
      {
        ...makePendingSignals(1)[0],
        id: "sig_approve",
        conversationId: "conv_approve",
        backendSignalId: "pred-approve",
        type: "retention",
        score: 0.9,
        confidence: 0.9,
        summary: "High retention",
      },
      {
        ...makePendingSignals(1)[0],
        id: "sig_lead",
        conversationId: "conv_lead",
        backendSignalId: "pred-lead",
        type: "lead",
        score: 0.92,
        confidence: 0.92,
        summary: "Lead needs review",
      },
      {
        ...makePendingSignals(1)[0],
        id: "sig_upsell",
        conversationId: "conv_upsell",
        backendSignalId: "pred-upsell",
        type: "upsell",
        score: 0.6,
        confidence: 0.6,
        summary: "Upsell needs review",
      },
      {
        ...makePendingSignals(1)[0],
        id: "sig_low",
        conversationId: "conv_low",
        backendSignalId: "pred-low",
        type: "retention",
        score: 0.74,
        confidence: 0.74,
        summary: "Lower retention",
      },
    ];
    const store = storeFromSignals(rows);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: rows.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.confidence,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    const approveAnchors = html.match(/<a\b[^>]*>Approve<\/a>/g) ?? [];
    const reviewAnchors = html.match(/<a\b[^>]*>Review<\/a>/g) ?? [];
    expect(approveAnchors).toHaveLength(2);
    expect(reviewAnchors).toHaveLength(6);
    expect(
      approveAnchors.every((anchor) => anchor.includes("rounded-full")),
    ).toBe(true);
    expect(
      reviewAnchors.every((anchor) => anchor.includes("rounded-full")),
    ).toBe(true);
    expect(html).toContain("Queue action: Approve, 1 signal");
    expect(html).toContain("Queue action: Review, 3 signals");
  });

  it("Follow-up list Action is Mark as Acted (not Review link)", () => {
    const follow: Signal = {
      id: "sig_follow_list",
      tenantId: "tenant_demo",
      conversationId: "conv_follow_list",
      type: "retention",
      score: 0.9,
      confidence: 0.9,
      summary: "Pause SIP follow-up",
      suggestedAction: "Call before pause.",
      evidence: ['quote: "Please pause"'],
      status: "reviewed",
      createdAt: "2026-08-01T00:00:00.000Z",
      backendSignalId: "pred-follow-list",
      feedback: {
        label: "correct",
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const store = storeFromSignals([follow]);
    store.conversations[0].customerName = "Priya";
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: "pred-follow-list",
              tenant_id: "tenant_demo",
              conversation_id: "conv_follow_list",
              signal_type: "retention",
              confidence: 0.9,
              summary: "Pause SIP follow-up",
              created_at: "2026-08-01T00:00:00.000Z",
              acted: false,
              feedback: {
                id: "fb-follow-list",
                tenant_id: "tenant_demo",
                signal_id: "pred-follow-list",
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );

    // List button posts Acted without opening preview (stay on Follow-up).
    expect(html).toContain(
      'aria-label="Mark as Acted for Pause SIP follow-up"',
    );
    expect(html).toMatch(/>\s*Mark as Acted\s*</);
    expect(html).not.toContain(">Review</a>");
    expect(html).not.toContain(">Mark as Acted</a>");
  });

  it("Done list Action is Marked as Acted (not Review)", () => {
    const acted: Signal = {
      id: "sig_done_list",
      tenantId: "tenant_demo",
      conversationId: "conv_done_list",
      type: "lead",
      score: 0.8,
      confidence: 0.8,
      summary: "Done lead",
      suggestedAction: "Nurture",
      evidence: ["quote"],
      status: "acted",
      createdAt: "2026-08-01T00:00:00.000Z",
      backendSignalId: "pred-done-list",
      feedback: {
        label: "correct",
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const store = storeFromSignals([acted]);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "acted",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: "pred-done-list",
              tenant_id: "tenant_demo",
              conversation_id: "conv_done_list",
              signal_type: "lead",
              confidence: 0.8,
              summary: "Done lead",
              created_at: "2026-08-01T00:00:00.000Z",
              acted: true,
              feedback: {
                id: "fb-done-list",
                tenant_id: "tenant_demo",
                signal_id: "pred-done-list",
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain(">Marked as Acted</a>");
    expect(html).not.toContain(">Review</a>");
    expect(html).not.toContain(">View</a>");
    expect(html).not.toContain('aria-label="Mark as Acted for');
  });

  it("empty Correct with no pending mirrors Pending mid-week empty", () => {
    const acted: Signal = {
      id: "sig_acted",
      tenantId: "tenant_demo",
      conversationId: "conv_acted",
      type: "retention",
      score: 0.88,
      confidence: 0.88,
      summary: "Acted retention",
      suggestedAction: "Retain",
      evidence: ["quote"],
      status: "acted",
      createdAt: "2026-08-01T00:00:00.000Z",
      backendSignalId: "pred-acted",
      feedback: {
        label: "correct",
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const store = storeFromSignals([acted]);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: "pred-acted",
              tenant_id: "tenant_demo",
              conversation_id: "conv_acted",
              signal_type: "retention",
              confidence: 0.88,
              summary: "Acted retention",
              created_at: "2026-08-01T00:00:00.000Z",
              acted: true,
              feedback: {
                id: "fb-1",
                tenant_id: "tenant_demo",
                signal_id: "pred-acted",
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceMidweek,
      }),
    );

    expect(html).toContain("No Signals Need Review");
    expect(html).toContain("Upload Weekly Export");
    expect(html).toMatch(/Upload this week’s export/);
    expect(html).not.toMatch(/upsert|keep-set|Day-1|external id|SignalScore/i);
    expect(html).toContain('data-slot="card"');
    expect(html).toContain("flex flex-1 flex-col items-center justify-center");
    expect(html).not.toContain("Review Pending");
  });

  it("pending queue miss uses partner-safe wake copy", () => {
    const store = storeFromSignals([]);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: false,
          error: "Signal Score backend unreachable: timed out after 10000ms",
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Review Queue Unavailable");
    expect(html).toContain("Retry in a moment");
    expect(html).toContain("Retry Queue");
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/Start FastAPI|from Neon|BACKEND_URL/);
  });

  it("asleep empty Neon queue keeps last counts and one Retry", () => {
    const reviewed = makePendingSignals(4).map((signal) => ({
      ...signal,
      status: "reviewed" as const,
      feedback: {
        label: "correct" as const,
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    }));
    const store = storeFromSignals(reviewed);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        scoreUnavailable: true,
        backendScore: null,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: false,
          error: "Signal Score backend unreachable: timed out after 10000ms",
        },
        cadenceAction: {
          id: "nextweek",
          label: "Next week — re-upload weekly export",
        },
      }),
    );

    const counts = [
      ...html.matchAll(/text-heading-16 text-sio-fg-base">(\d+)</g),
    ].map((match) => match[1]);
    expect(counts.slice(0, 3)).toEqual(["4", "4", "0"]);
    expect(html).toContain("The weekly score is waiting.");
    expect(html).toContain("Weekly Score Waiting");
    expect(html.match(/>Retry</g)).toHaveLength(1);
    expect(html).not.toContain("Retry Queue");
    expect(html).not.toContain("This week’s reviews are done");
    expect(html).not.toContain("No Signals Need Review");
    expect(html).not.toMatch(/FastAPI|Neon|BACKEND_URL|keep-set|SignalScore/i);
  });

  it("Follow-up queue miss uses partner-safe wake copy", () => {
    const store = storeFromSignals([]);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: false,
          error: "Signal Score backend unreachable: timed out after 10000ms",
        },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Follow-Up Queue Unavailable");
    expect(html).toContain("Retry in a moment");
    expect(html).toContain("Retry Queue");
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/Start FastAPI|from Neon|BACKEND_URL/);
  });

  it("does not list a stale JSON-unreviewed signal that Neon already reviewed", () => {
    const stale = {
      ...makePendingSignals(1)[0],
      id: "sig_stale_instance",
      conversationId: "conv_reviewed",
      backendSignalId: "pred-reviewed",
      summary: "Stale instance pending ghost",
    };
    const store = storeFromSignals([stale]);
    const neonReviewed = {
      id: "pred-reviewed",
      tenant_id: "tenant_demo",
      conversation_id: "conv_reviewed",
      signal_type: "lead" as const,
      confidence: 0.9,
      summary: "Already reviewed on another instance",
      created_at: "2026-08-01T00:00:00.000Z",
      acted: false,
      feedback: {
        id: "fb-reviewed",
        tenant_id: "tenant_demo",
        signal_id: "pred-reviewed",
        feedback: "correct" as const,
        note: null,
        reviewed_by: "demo",
        reviewed_at: "2026-08-02T00:00:00.000Z",
      },
    };

    const pendingHtml = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [neonReviewed] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(pendingHtml).toContain("No Signals Need Review");
    expect(pendingHtml).not.toContain("Stale instance pending ghost");

    const followHtml = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [neonReviewed] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(followHtml).toContain("Stale instance pending ghost");
    expect(followHtml).toContain("Correct");
  });
});

describe("InsightsView Neon pending overlay", () => {
  it("lists a Neon-only pending stub when overlay has the chat", () => {
    const store = storeFromSignals([]);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: [
            {
              id: "hydrate-pred",
              tenant_id: "tenant_demo",
              conversation_id: "conv_hydrated",
              signal_type: "retention",
              confidence: 0.81,
              summary: "Priya (WhatsApp) asked to pause SIP",
              created_at: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
        tenantSignals: { ok: true, rows: [] },
        overlayChats: {
          conversations: [
            {
              id: "conv_hydrated",
              tenantId: "tenant_demo",
              channel: "whatsapp",
              startedAt: "2026-08-01T00:00:00.000Z",
              messageIds: ["msg_1"],
              customerName: "Priya",
            },
          ],
          messages: [
            {
              id: "msg_1",
              conversationId: "conv_hydrated",
              role: "customer",
              content: "Please pause my SIP this month",
              timestamp: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Priya");
    expect(html).toContain("pause SIP");
    expect(html).not.toContain("No Signals Need Review");
  });

  it("omits a Neon-only pending stub when overlay has no chat", () => {
    const store = storeFromSignals([]);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: [
            {
              id: "stale-pred",
              tenant_id: "tenant_demo",
              conversation_id: "conv_other_pack",
              signal_type: "lead",
              confidence: 0.7,
              summary: "Leftover Groww pending",
              created_at: "2026-08-01T00:00:00.000Z",
            },
          ],
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("No Signals Yet");
    expect(html).not.toContain("Leftover Groww pending");
  });

  it("does not keep another pack’s signals when Sample is selected", () => {
    const pending = makePendingSignals(2);
    const store = storeFromSignals(pending);
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Zerodha_week_5_batch_01.json",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "Groww_batch_02",
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    const visible = html.replace(
      /<span class="sr-only"[\s\S]*?<\/span>/g,
      "",
    );
    expect(html).toContain("Conversation that needs your attention");
    expect(html).not.toContain("Pending signal 1");
    expect(html).not.toContain("Pending signal 2");
    expect(html).toContain("No Signals Yet");
    expect(visible).not.toContain("Finding signals…");
    expect(html).not.toContain("Usually ready in about 20 seconds.");
    expect(html).not.toContain("Sample failed to load");
    expect(html).not.toContain("taking longer than expected");
    expect(html).not.toContain("Still waiting on the current load");
    expect(visible).not.toContain(">Cancel<");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toContain('aria-label="Loading"');
    expect(html).not.toContain("Sample Not Loaded");
  });

  it("does not keep Sample signals when Partner Demo is selected", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Groww_batch_02",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "Zerodha_batch_02",
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    const visible = html.replace(
      /<span class="sr-only"[\s\S]*?<\/span>/g,
      "",
    );
    expect(html).not.toContain("Pending signal 1");
    expect(html).toContain("No Signals Yet");
    expect(html).toContain("Conversation that needs your attention");
    expect(visible).not.toContain("Finding signals…");
    expect(html).not.toContain("Usually ready in about 20 seconds.");
    expect(html).not.toContain("Partner Demo failed to load");
    expect(html).not.toContain("taking longer than expected");
    expect(html).not.toContain("animate-spin");
    expect(html).not.toMatch(/href="\/\?view=upload"[^>]*>Cancel/);
  });

  it("keeps the normal empty queue while Sample seeds an empty keep-set", () => {
    const store = storeFromSignals([]);
    store.pilot = { baselineOpportunities: 0 };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "Groww_batch_02",
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    const visible = html.replace(
      /<span class="sr-only"[\s\S]*?<\/span>/g,
      "",
    );
    expect(html).toContain("Conversation that needs your attention");
    expect(html).toContain("No Signals Yet");
    expect(visible).not.toContain("Finding signals…");
    expect(html).not.toContain("Usually ready in about 20 seconds.");
    expect(html).not.toContain("Sample failed to load");
    expect(html).not.toContain("taking longer than expected");
    expect(visible).not.toContain(">Cancel<");
    expect(html).not.toContain("animate-spin");
  });

  it("shows the pending queue when preview is not in the keep-set", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: "sig_from_another_pack",
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
        precomputedPending: pending,
        precomputedReviewed: [],
      }),
    );

    expect(html).toContain("Pending signal 1");
    expect(html).toContain("Conversation that needs your attention");
    expect(html).not.toContain("Signal Not Found");
  });

  it("opens review when preview is a Neon stub of a joined signal", () => {
    const pending = makePendingSignals(1);
    pending[0].backendSignalId = "pred-sagar";
    pending[0].summary = "Sagar is exploring products";
    const store = storeFromSignals(pending);
    store.conversations[0].customerName = "Sagar Chavan";
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: "sig_neon_pred-sagar",
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
        precomputedPending: pending,
        precomputedReviewed: [],
      }),
    );

    expect(html).toContain("Sagar Chavan");
    expect(html).toContain("exploring products");
    expect(html).not.toContain("Signal Not Found");
  });

  it("does not treat batch_02.json as the Sample keep-set", () => {
    const pending = makePendingSignals(1);
    pending[0].id = "sig_conv_rucha_patwardhan_12_lead_0";
    pending[0].conversationId = "conv_rucha_patwardhan_12";
    pending[0].summary = "Rucha Patwardhan is exploring products";
    const store = storeFromSignals(pending);
    store.conversations[0].customerName = "Rucha Patwardhan";
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Groww_batch_02",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: pending[0].id,
        vaultFile: "batch_02.json",
        jsonKeepSet: true,
        needsReview: {
          ok: true,
          predictions: pending.map((signal) => ({
            id: signal.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: signal.conversationId,
            signal_type: signal.type,
            confidence: signal.score,
            summary: signal.summary,
            created_at: signal.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).not.toContain("Rucha Patwardhan");
    expect(html).not.toContain("exploring products");
    expect(html).toContain("Upload this week’s export");
    expect(html).not.toContain("Finding signals…");
    expect(html).not.toContain("Usually ready in about 20 seconds.");
    expect(html).not.toContain("taking longer than expected");
  });

  it("keeps an uploaded batch_02.json preview in the queue", () => {
    const pending = makePendingSignals(1);
    pending[0].id = "sig_conv_rucha_patwardhan_12_lead_0";
    pending[0].conversationId = "conv_rucha_patwardhan_12";
    pending[0].summary = "Rucha Patwardhan is exploring products";
    const other = {
      ...makePendingSignals(1)[0],
      id: "sig_other",
      conversationId: "conv_other",
      summary: "Other file signal",
      backendSignalId: "pred-other",
    };
    const store = storeFromSignals([pending[0], other]);
    store.conversations[0].id = "conv_rucha_patwardhan_12";
    store.conversations[0].customerName = "Rucha Patwardhan";
    store.conversations[0].sourceFile = "batch_02";
    store.conversations[1].sourceFile = "notes.csv";
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Batch_02.JSON",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: "sig_conv_rucha_patwardhan_12_lead_0",
        vaultFile: "batch_02.json",
        uploadedFileNames: ["batch_02", "notes.csv"],
        needsReview: {
          ok: true,
          predictions: [pending[0], other].map((signal) => ({
            id: signal.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: signal.conversationId,
            signal_type: signal.type,
            confidence: signal.score,
            summary: signal.summary,
            created_at: signal.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
        jsonKeepSet: true,
      }),
    );

    expect(html).toContain("Rucha Patwardhan");
    expect(html).toContain("exploring products");
    expect(html).not.toContain("Signal Not Found");
    expect(html).not.toContain("Other file signal");
    expect(html).not.toContain("Finding signals…");
    expect(html).not.toContain("Usually ready in about 20 seconds.");
    expect(html).not.toContain("Sample failed to load");
    expect(html).not.toContain("taking longer than expected");
  });

  it("keeps Upload CTA and demo chrome when a weekly file is not loaded yet", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Groww_batch_02",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "Zerodha_week_5_batch_01.json",
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Upload this week’s export");
    expect(html).not.toContain("keep-set");
    expect(html).not.toContain("Loading this week’s export");
    expect(html).toContain("Run Partner Demo");
    expect(html).not.toContain("Second pass has more chats");
  });

  it("waits for the uploaded file instead of asking for another export", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Groww_batch_02",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        importedCount: 100,
        newSignalCount: 20,
        statusFilter: "all",
        typeFilter: "all",
        page: 1,
        vaultFile: "Zerodha_week_7_batch_01.json",
        needsReview: { ok: false, error: "timed out" },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Loading this week’s export");
    expect(html).toContain("The chats are still opening");
    expect(html).not.toContain("This file is not loaded yet");
    expect(html).not.toContain("Upload this week’s export");
  });

  it("does not borrow the loaded pack’s second-pass notice for an unloaded file", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Groww_batch_02",
    };
    store.llmSkippedConversationIds = Array.from(
      { length: 45 },
      (_, index) => `conv_skip_${index}`,
    );
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "Zerodha_week_7_batch_01 copy.json",
        needsReview: { ok: true, predictions: [] },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("This file is not loaded yet");
    expect(html).not.toContain("45 chats were not classified");
    expect(html).not.toContain("Second pass has more chats");
  });

  it("shows an earlier file from the same upload instead of the empty vault", () => {
    const week7 = makePendingSignals(1)[0];
    week7.summary = "Week 7 pause";
    week7.conversationId = "conv_week7";
    const week8 = {
      ...makePendingSignals(1)[0],
      id: "sig_week8",
      conversationId: "conv_week8",
      summary: "Week 8 pause",
      backendSignalId: "pred-week8",
    };
    const store = storeFromSignals([week7, week8]);
    store.conversations[0].sourceFile = "Zerodha_week_7_batch_01.json";
    store.conversations[1].sourceFile = "Zerodha_week_8_batch_01.json";
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Zerodha_week_8_batch_01.json",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "Zerodha_week_7_batch_01.json",
        uploadedFileNames: [
          "Zerodha_week_7_batch_01.json",
          "Zerodha_week_8_batch_01.json",
        ],
        needsReview: {
          ok: true,
          predictions: [week7, week8].map((signal) => ({
            id: signal.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: signal.conversationId,
            signal_type: signal.type,
            confidence: signal.score,
            summary: signal.summary,
            created_at: signal.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Week 7 pause");
    expect(html).not.toContain("Week 8 pause");
    expect(html).not.toContain("This file is not loaded yet");
    expect(html).not.toContain("Upload this week’s export");
  });

  it("scopes one uploaded file and leaves unstamped demo chats out", () => {
    const week = makePendingSignals(1)[0];
    week.summary = "Week pending";
    week.conversationId = "conv_week";
    const demo = {
      ...makePendingSignals(1)[0],
      id: "sig_demo",
      conversationId: "conv_demo",
      summary: "Demo leftover",
      backendSignalId: "pred-demo",
    };
    const store = storeFromSignals([week, demo]);
    store.conversations[0].sourceFile = "week.csv";
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "week.csv",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        vaultFile: "week.csv",
        uploadedFileNames: ["week.csv"],
        needsReview: {
          ok: true,
          predictions: [week, demo].map((signal) => ({
            id: signal.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: signal.conversationId,
            signal_type: signal.type,
            confidence: signal.score,
            summary: signal.summary,
            created_at: signal.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Week pending");
    expect(html).not.toContain("Demo leftover");
  });

  it("shows only the selected file on pending, follow-up, and done", () => {
    const weekPending = {
      ...makePendingSignals(1)[0],
      id: "sig_week_pending",
      conversationId: "conv_week",
      summary: "Week pending only",
      backendSignalId: "pred-week-pending",
    };
    const otherPending = {
      ...makePendingSignals(1)[0],
      id: "sig_other_pending",
      conversationId: "conv_other",
      summary: "Other pending only",
      backendSignalId: "pred-other-pending",
    };
    const reviewedAt = "2026-08-02T00:00:00.000Z";
    const weekFollow = {
      ...weekPending,
      id: "sig_week_follow",
      summary: "Week follow-up only",
      status: "reviewed" as const,
      backendSignalId: "pred-week-follow",
      feedback: { label: "correct" as const, reviewedAt },
    };
    const otherFollow = {
      ...otherPending,
      id: "sig_other_follow",
      summary: "Other follow-up only",
      status: "reviewed" as const,
      backendSignalId: "pred-other-follow",
      feedback: { label: "correct" as const, reviewedAt },
    };
    const weekDone = {
      ...weekFollow,
      id: "sig_week_done",
      summary: "Week done only",
      status: "acted" as const,
      backendSignalId: "pred-week-done",
    };
    const otherDone = {
      ...otherFollow,
      id: "sig_other_done",
      summary: "Other done only",
      status: "acted" as const,
      backendSignalId: "pred-other-done",
    };
    const store = storeFromSignals([
      weekPending,
      otherPending,
      weekFollow,
      otherFollow,
      weekDone,
      otherDone,
    ]);
    for (const conversation of store.conversations) {
      conversation.sourceFile =
        conversation.id === "conv_week" ? "week.csv" : "notes.csv";
    }
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "notes.csv",
    };
    const shared = {
      store,
      typeFilter: "all" as const,
      page: 1,
      vaultFile: "week.csv",
      uploadedFileNames: ["week.csv", "notes.csv"],
      needsReview: { ok: true as const, predictions: [] },
      tenantSignals: { ok: true as const, rows: [] },
      cadenceAction: cadenceReviews,
      precomputedPending: [weekPending, otherPending],
      precomputedReviewed: [weekFollow, otherFollow, weekDone, otherDone],
    };

    const pendingHtml = renderToStaticMarkup(
      createElement(InsightsView, { ...shared, statusFilter: "new" }),
    );
    expect(pendingHtml).toContain("Week pending only");
    expect(pendingHtml).not.toContain("Other pending only");

    const followHtml = renderToStaticMarkup(
      createElement(InsightsView, { ...shared, statusFilter: "followup" }),
    );
    expect(followHtml).toContain("Week follow-up only");
    expect(followHtml).not.toContain("Other follow-up only");

    const doneHtml = renderToStaticMarkup(
      createElement(InsightsView, { ...shared, statusFilter: "acted" }),
    );
    expect(doneHtml).toContain("Week done only");
    expect(doneHtml).not.toContain("Other done only");
  });

  it("keeps Run Partner Demo when keep-set is Groww (pack is not last upload)", () => {
    const pending = makePendingSignals(2);
    const store = storeFromSignals(pending);
    store.pilot = {
      baselineOpportunities: 12,
      lastUploadedFileName: "Groww_batch_02",
    };
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Run Partner Demo");
    expect(html).toContain("btn-secondary rounded-[var(--radius-panel)]");
    expect(html).toContain("Pending signal 1");
  });
});

describe("InsightsView pending review walk", () => {
  const scoreFrom = "2026-08-17";
  const walk = shuffleSignals(makePendingSignals(3));
  const firstId = walk[0].id;
  const secondId = walk[1].id;
  const lastId = walk[2].id;

  it("disables Prev on the first pending and deep-links Next/Skip", () => {
    const html = renderPendingPreview({
      count: 3,
      previewId: firstId,
      scoreFrom,
    });

    expect(html).toContain('aria-label="Insights review"');
    expect(html).toContain("Insights Queue");
    expect(html).toContain('data-slot="breadcrumb-list"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain("Skip pending review");
    expect(html).toContain("Previous pending review");
    expect(html).toContain("Next pending review");
    expect(html).toContain(">Prev</button>");
    expect(html).toContain(">Next<svg");
    expect(html).toContain(">Skip</a>");
    expect(html).toContain('data-variant="outline"');
    expect(html).toContain("h-8 gap-2");
    expect(html).toContain('disabled=""');
    expect(html).not.toContain(
      `href="/?view=insights&amp;scoreFrom=2026-08-17&amp;status=new&amp;preview=${lastId}"`,
    );
    expect(html).toContain(
      `href="/?view=insights&amp;scoreFrom=2026-08-17&amp;status=new&amp;preview=${secondId}"`,
    );
    expect(html).not.toContain("Conversation that needs your attention");
    expect(html).not.toContain(`id="signal-summary-${firstId}"`);
    expect(html).toContain(`id="signal-review-summary-${firstId}"`);
  });

  it("disables Next on the last pending", () => {
    const html = renderPendingPreview({
      count: 3,
      previewId: lastId,
      scoreFrom,
    });

    expect(html).toContain("Next pending review");
    expect(html).toContain('disabled=""');
    expect(html).toContain(
      `href="/?view=insights&amp;scoreFrom=2026-08-17&amp;status=new&amp;preview=${secondId}"`,
    );
    expect(html).not.toContain(
      'href="/?view=insights&amp;scoreFrom=2026-08-17&amp;status=new&amp;preview=sig_4"',
    );
  });

  it("sends last Skip to the list without preview and keeps scoreFrom", () => {
    const html = renderPendingPreview({
      count: 3,
      previewId: lastId,
      scoreFrom,
    });

    const skipHref = html.match(
      /href="([^"]*)"[^>]*aria-label="Skip pending review"/,
    )?.[1];
    expect(skipHref).toBe(
      "/?view=insights&amp;scoreFrom=2026-08-17&amp;status=new",
    );
    expect(skipHref).not.toContain("preview=");
  });

  it("keeps replaced=1 on Next and Skip after replace ingest", () => {
    const html = renderPendingPreview({
      count: 3,
      previewId: firstId,
      jsonKeepSet: true,
    });
    expect(html).toContain(
      `href="/?view=insights&amp;status=new&amp;preview=${secondId}&amp;replaced=1"`,
    );
    const skipHref = html.match(
      /href="([^"]*)"[^>]*aria-label="Skip pending review"/,
    )?.[1];
    expect(skipHref).toBe(
      `/?view=insights&amp;status=new&amp;preview=${secondId}&amp;replaced=1`,
    );
  });

  it("Prev/Next/Skip walk every pending draft when action=approve", () => {
    const mixed: Signal[] = [
      {
        ...makePendingSignals(1)[0],
        id: "sig_review_1",
        conversationId: "conv_review_1",
        backendSignalId: "pred-review-1",
        type: "lead",
        score: 0.9,
        confidence: 0.9,
      },
      {
        ...makePendingSignals(1)[0],
        id: "sig_approve_1",
        conversationId: "conv_approve_1",
        backendSignalId: "pred-approve-1",
        type: "retention",
        score: 0.9,
        confidence: 0.9,
        summary: "Approve signal 1",
      },
      {
        ...makePendingSignals(1)[0],
        id: "sig_review_2",
        conversationId: "conv_review_2",
        backendSignalId: "pred-review-2",
        type: "lead",
        score: 0.85,
        confidence: 0.85,
      },
      {
        ...makePendingSignals(1)[0],
        id: "sig_approve_2",
        conversationId: "conv_approve_2",
        backendSignalId: "pred-approve-2",
        type: "retention",
        score: 0.88,
        confidence: 0.88,
        summary: "Approve signal 2",
      },
    ];
    const approveWalk = queueSignalsForFilter({
      pending: mixed,
      reviewed: [],
      status: "new",
      type: "all",
      action: "approve",
    }).filtered;
    expect(approveWalk.map((row) => row.id).sort()).toEqual(
      ["sig_approve_1", "sig_approve_2"].sort(),
    );
    const index = approveWalk.findIndex((row) => row.id === "sig_approve_1");
    const next = approveWalk[index + 1];
    const html = renderPendingPreview({
      count: mixed.length,
      previewId: "sig_approve_1",
      actionFilter: "approve",
      signals: mixed,
    });

    expect(html).toContain("action=approve");
    if (next) {
      expect(html).toContain(
        `href="/?view=insights&amp;status=new&amp;action=approve&amp;preview=${next.id}"`,
      );
    }
    const skipHref = html.match(
      /href="([^"]*)"[^>]*aria-label="Skip pending review"/,
    )?.[1];
    if (next) {
      expect(skipHref).toBe(
        `/?view=insights&amp;status=new&amp;action=approve&amp;preview=${next.id}`,
      );
    }

    const last = approveWalk[approveWalk.length - 1];
    const lastHtml = renderPendingPreview({
      count: mixed.length,
      previewId: last.id,
      actionFilter: "approve",
      signals: mixed,
    });
    const lastSkip = lastHtml.match(
      /href="([^"]*)"[^>]*aria-label="Skip pending review"/,
    )?.[1];
    expect(lastSkip).toBe("/?view=insights&amp;status=new&amp;action=approve");
    expect(lastSkip).not.toContain("preview=");

    const reviewHtml = renderPendingPreview({
      count: mixed.length,
      previewId: "sig_approve_1",
      actionFilter: "review",
      signals: mixed,
    });
    expect(reviewHtml).not.toContain("action=approve&amp;preview=");
  });

  it("keeps Prev/Next/Skip after Correct while pending remains", () => {
    const pending = makePendingSignals(2);
    const corrected = {
      ...pending[0],
      status: "reviewed" as const,
      feedback: {
        label: "correct" as const,
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const remaining = pending[1];
    const store = storeFromSignals([corrected, remaining]);

    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        previewId: corrected.id,
        scoreFrom: "2026-08-17",
        needsReview: {
          ok: true,
          predictions: [
            {
              id: remaining.backendSignalId!,
              tenant_id: "tenant_demo",
              conversation_id: remaining.conversationId,
              signal_type: remaining.type,
              confidence: remaining.score,
              summary: remaining.summary,
              created_at: remaining.createdAt,
            },
          ],
        },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: corrected.backendSignalId!,
              tenant_id: "tenant_demo",
              conversation_id: corrected.conversationId,
              signal_type: corrected.type,
              confidence: corrected.score,
              summary: corrected.summary,
              created_at: corrected.createdAt,
              acted: false,
              feedback: {
                id: "fb-correct-walk",
                tenant_id: "tenant_demo",
                signal_id: corrected.backendSignalId!,
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Skip pending review");
    expect(html).toContain("Next pending review");
    expect(html).toContain("Previous pending review");
    expect(html).toContain("sticky top-0");
    expect(html).toContain(
      'href="/?view=insights&amp;scoreFrom=2026-08-17&amp;status=followup&amp;preview=sig_2"',
    );
    const skipHref = html.match(
      /href="([^"]*)"[^>]*aria-label="Skip pending review"/,
    )?.[1];
    expect(skipHref).toBe(
      "/?view=insights&amp;scoreFrom=2026-08-17&amp;status=followup&amp;preview=sig_2",
    );
  });
});

describe("InsightsView review conversation + action", () => {
  it("pairs the conversation panel with Suggested Next Action", () => {
    const pending = makePendingSignals(1);
    pending[0].evidence = ['quote: "Please pause my SIP this month"'];
    const store = storeFromSignals(pending);
    store.messages = [
      {
        id: "msg_1",
        conversationId: pending[0].conversationId,
        role: "customer",
        content: "Please pause my SIP this month",
        timestamp: "2026-08-01T10:05:00.000Z",
      },
    ];
    store.conversations[0].customerName = "Priya";
    store.conversations[0].messageIds = ["msg_1"];

    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: pending[0].id,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Correct");
    expect(html).toContain("Copy Reply");
    expect(html).not.toContain('data-review-slot="decision"');
    expect(html).toContain("Please pause my SIP this month");
    expect(html).not.toContain("See Conversation");
    expect(html).toContain("Open Conversation");
    expect(html).toContain('aria-haspopup="dialog"');
    // Sticky Pending review nav: Prev → Next → Skip → Open Conversation.
    const pendingNav = html.match(
      /aria-label="Pending review"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    expect(pendingNav).toBeTruthy();
    expect(pendingNav!).toContain("Skip pending review");
    expect(pendingNav!).toContain("Open Conversation");
    expect(pendingNav!.indexOf("Skip pending review")).toBeLessThan(
      pendingNav!.indexOf("Open Conversation"),
    );
    expect(html).toContain("border-border bg-background");
    expect(html).toContain("h-8 gap-2 shrink-0");
    expect(html).toContain(
      "block min-w-0 truncate text-heading-16 font-medium !text-sio-fg-base",
    );
    expect(html).not.toContain(
      "btn-secondary shrink-0 font-normal text-foreground",
    );
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain(
      "Show in conversation: Please pause my SIP this month",
    );
    expect(html).not.toContain("A / Enter → Mark as Acted");
  });

  it("shows rail Run Actions on Follow-up Correct preview", () => {
    const follow: Signal = {
      id: "sig_follow",
      tenantId: "tenant_demo",
      conversationId: "conv_follow",
      type: "retention",
      score: 0.9,
      confidence: 0.9,
      summary: "Pause SIP",
      suggestedAction: "Call before pause window closes.",
      evidence: ['quote: "Please pause my SIP"'],
      status: "reviewed",
      createdAt: "2026-08-01T00:00:00.000Z",
      backendSignalId: "pred-follow",
      feedback: {
        label: "correct",
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const store = storeFromSignals([follow]);
    store.conversations[0].customerName = "Priya";
    store.messages = [
      {
        id: "msg_1",
        conversationId: "conv_follow",
        role: "customer",
        content: "Please pause my SIP",
        timestamp: "2026-08-01T10:05:00.000Z",
      },
    ];
    store.conversations[0].messageIds = ["msg_1"];

    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        previewId: follow.id,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: "pred-follow",
              tenant_id: "tenant_demo",
              conversation_id: "conv_follow",
              signal_type: "retention",
              confidence: 0.9,
              summary: "Pause SIP",
              created_at: "2026-08-01T00:00:00.000Z",
              acted: false,
              feedback: {
                id: "fb-1",
                tenant_id: "tenant_demo",
                signal_id: "pred-follow",
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Retention email");
    expect(html).toContain("Run Actions");
    // Open review row is the short label. The list command stays Mark as Acted.
    expect(html).toMatch(/>\s*Acted\s*<\/button>/);
    expect(html).not.toContain("Mark as Acted");
    expect(html).not.toContain(
      "You run this in your tools — Sioona never sends.",
    );
    expect(html).toContain('data-review-slot="retention-email"');
    const feedbackSlot = html.indexOf('data-review-slot="feedback"');
    const actionsSlot = html.indexOf('data-review-slot="actions"');
    const retentionSlot = html.indexOf('data-review-slot="retention-email"');
    const whySlot = html.indexOf('data-review-slot="why"');
    expect(feedbackSlot).toBeGreaterThan(-1);
    expect(actionsSlot).toBeGreaterThan(feedbackSlot);
    expect(retentionSlot).toBeGreaterThan(actionsSlot);
    expect(whySlot).toBeGreaterThan(actionsSlot);
    expect(html).not.toContain('data-review-actions-footer="true"');
    expect(html).toContain(
      "min-h-9 shrink-0 touch-manipulation bg-sio-bg-inverse text-sio-fg-on-color hover:bg-sio-bg-inverse/90",
    );
    expect(html).toContain("Copy Reply");
    expect(html).toContain("Hi Priya — I saw your note about");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).not.toContain(
      "Copy Reply, then A / Enter → Acted (does not send).",
    );
    expect(html).not.toContain(
      "Copy Reply from Suggested Next Action, then Mark Acted",
    );
    expect(html).not.toContain("Mark as Pending");
    expect(html).toContain("Open Conversation");
    expect(html).toContain('aria-haspopup="dialog"');
    // Follow-up Correct: no pending walk — Open Conversation still in sticky header.
    expect(html).not.toContain('aria-label="Pending review"');
    expect(html).toContain("border-border bg-background");
    expect(html).toContain("h-8 gap-2 shrink-0");
    expect(html).toContain(
      "block min-w-0 truncate text-heading-16 font-medium !text-sio-fg-base",
    );
    expect(html).not.toContain(
      "btn-secondary shrink-0 font-normal text-foreground",
    );
    expect(html).toContain("data-review-keyboard-root");
    expect(html).not.toContain("Skip pending review");
  });

  it("keeps Run Actions on Suggested Next Action, not under Feedback", () => {
    const pending = makePendingSignals(1);
    const correctSignal = {
      ...pending[0],
      status: "reviewed" as const,
      feedback: {
        label: "correct" as const,
        reviewedAt: "2026-08-02T00:00:00.000Z",
      },
    };
    const store = storeFromSignals([correctSignal]);

    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        previewId: correctSignal.id,
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: correctSignal.backendSignalId!,
              tenant_id: "tenant_demo",
              conversation_id: correctSignal.conversationId,
              signal_type: correctSignal.type,
              confidence: correctSignal.score,
              summary: correctSignal.summary,
              created_at: correctSignal.createdAt,
              acted: false,
              feedback: {
                id: "fb-correct-1",
                tenant_id: "tenant_demo",
                signal_id: correctSignal.backendSignalId!,
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).not.toContain(
      "Mark as Acted on Suggested Next Action (does not send).",
    );
    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Run Actions");
    expect(html).not.toContain(
      "You run this in your tools — Sioona never sends.",
    );
    expect(html).not.toContain(
      "Copy Reply, then A / Enter → Acted (does not send).",
    );
    expect(html).not.toContain(
      "Copy Reply from Suggested Next Action, then Mark Acted",
    );
    expect(html).toContain("Copy Reply");
  });
});

describe("InsightsView evidence-grounded review", () => {
  it("shows the transcript and a Why This Fired jump on preview", () => {
    const pending = makePendingSignals(1);
    pending[0].conversationId = "conv_1";
    pending[0].evidence = ['quote: "I want to close my account"'];
    const store = storeFromSignals(pending);
    store.conversations[0].messageIds = ["msg_1", "msg_2"];
    store.messages = [
      {
        id: "msg_1",
        conversationId: "conv_1",
        role: "agent",
        content: "How can I help?",
        timestamp: "2026-08-01T00:00:00.000Z",
      },
      {
        id: "msg_2",
        conversationId: "conv_1",
        role: "customer",
        content: "I want to close my account",
        timestamp: "2026-08-01T00:01:00.000Z",
      },
    ];
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: pending[0].id,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("I want to close my account");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Correct");
    expect(html).toContain("Incorrect");
    expect(html).toContain("Ground Truth");
    expect(html).toContain('aria-label="Ground Truth, Unset"');
    expect(html).toContain('data-review-slot="feedback"');
    expect(html).toContain('data-review-slot="why"');
    expect(html).toContain("insights-review-split");
    expect(html).toContain('data-review-slot="transcript"');
    expect(html).toContain("Open Conversation");
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('data-review-slot="decision"');
    const feedbackSlot = html.indexOf('data-review-slot="feedback"');
    const whySlot = html.indexOf('data-review-slot="why"');
    expect(feedbackSlot).toBeGreaterThan(-1);
    expect(whySlot).toBeGreaterThan(feedbackSlot);
    expect(html.indexOf("Show in conversation:", whySlot)).toBeGreaterThan(
      whySlot,
    );
    expect(html.indexOf('aria-label="Ground Truth, Unset"')).toBeGreaterThan(
      -1,
    );
    expect(html.indexOf('aria-label="Ground Truth, Unset"')).toBeLessThan(
      whySlot,
    );
    // Open Conversation lives in Pending review nav after Skip — not the rail.
    const pendingNav = html.match(
      /aria-label="Pending review"[^>]*>([\s\S]*?)<\/nav>/,
    )?.[1];
    expect(pendingNav).toBeTruthy();
    expect(pendingNav!.indexOf("Skip pending review")).toBeLessThan(
      pendingNav!.indexOf("Open Conversation"),
    );
    const openConversation = html.indexOf("Open Conversation");
    expect(openConversation).toBeGreaterThan(-1);
    expect(openConversation).toBeLessThan(feedbackSlot);
    expect(html).toContain("border-border bg-background");
    expect(html).toContain("conversation-message-msg_2");
    expect(html).toContain("Show in conversation:");
    expect(html).toContain('data-evidence-match="true"');
    expect(html).not.toContain("No messages stored");
  });

  it("shows honest empty transcript when the conversation has no messages", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        previewId: pending[0].id,
        needsReview: {
          ok: true,
          predictions: pending.map((s) => ({
            id: s.backendSignalId!,
            tenant_id: "tenant_demo",
            conversation_id: s.conversationId,
            signal_type: s.type,
            confidence: s.score,
            summary: s.summary,
            created_at: s.createdAt,
          })),
        },
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );

    expect(html).toContain("No messages stored");
    expect(html).toContain("No invented");
    expect(html).toContain("Feedback");
    expect(html).toContain("Correct");
    expect(html).toContain("Recommended Actions");
    expect(html).not.toContain('data-review-slot="decision"');
    expect(html).toContain("insights-review-split");
  });

  it("hides leftover Neon overlay cards when JSON already has a keep-set", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    const overlayChats = {
      conversations: [
        {
          id: "conv_old_pack",
          tenantId: "tenant_demo",
          channel: "whatsapp" as const,
          startedAt: "2026-08-01T00:00:00.000Z",
          messageIds: [],
          customerName: "Leftover",
        },
      ],
      messages: [],
    };
    const leftoverNeedsReview = {
      ok: true as const,
      predictions: [
        {
          id: "old-pack",
          tenant_id: "tenant_demo",
          conversation_id: "conv_old_pack",
          signal_type: "lead" as const,
          confidence: 0.9,
          summary: "Leftover before prune",
          created_at: "2026-08-01T00:00:00.000Z",
        },
        {
          id: pending[0].backendSignalId!,
          tenant_id: "tenant_demo",
          conversation_id: pending[0].conversationId,
          signal_type: pending[0].type,
          confidence: pending[0].score,
          summary: pending[0].summary,
          created_at: pending[0].createdAt,
        },
      ],
    };

    // Even without replaced=1, an active JSON keep-set must ignore leftover overlay.
    const withOverlay = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        overlayChats,
        needsReview: leftoverNeedsReview,
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(withOverlay).not.toContain("sig_neon_old-pack");
    expect(withOverlay).not.toContain("Leftover before prune");
    expect(withOverlay).toContain("Pending signal 1");

    const jsonKeepSet = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "new",
        typeFilter: "all",
        page: 1,
        jsonKeepSet: true,
        overlayChats,
        importedCount: 1,
        newSignalCount: 1,
        needsReview: leftoverNeedsReview,
        tenantSignals: { ok: true, rows: [] },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(jsonKeepSet).not.toContain("sig_neon_old-pack");
    expect(jsonKeepSet).toContain("Pending signal 1");
    expect(jsonKeepSet).toContain("replaced=1");
  });

  it("hides leftover Follow-up Neon Corrects from another pack", () => {
    const pending = makePendingSignals(1);
    const store = storeFromSignals(pending);
    const html = renderToStaticMarkup(
      createElement(InsightsView, {
        store,
        statusFilter: "followup",
        typeFilter: "all",
        page: 1,
        overlayChats: {
          conversations: [
            {
              id: "conv_old_pack",
              tenantId: "tenant_demo",
              channel: "whatsapp",
              startedAt: "2026-08-01T00:00:00.000Z",
              messageIds: [],
              customerName: "Leftover Groww",
            },
          ],
          messages: [],
        },
        needsReview: { ok: true, predictions: [] },
        tenantSignals: {
          ok: true,
          rows: [
            {
              id: "old-correct",
              tenant_id: "tenant_demo",
              conversation_id: "conv_old_pack",
              signal_type: "lead",
              confidence: 0.9,
              summary: "Leftover Groww Correct",
              created_at: "2026-08-01T00:00:00.000Z",
              acted: false,
              feedback: {
                id: "fb-old",
                tenant_id: "tenant_demo",
                signal_id: "old-correct",
                feedback: "correct",
                note: null,
                reviewed_by: "demo",
                reviewed_at: "2026-08-02T00:00:00.000Z",
              },
            },
          ],
        },
        cadenceAction: cadenceReviews,
      }),
    );
    expect(html).not.toContain("Leftover Groww Correct");
    expect(html).not.toContain("sig_neon_old-correct");
  });

  it("shows empty states for a signed-in tenant with no chats", async () => {
    const store: StoreData = {
      tenant: {
        id: "tenant_partner",
        name: "Partner",
        createdAt: "2026-10-01T00:00:00.000Z",
      },
      conversations: [],
      messages: [],
      signals: [],
      pilot: { baselineOpportunities: 0 },
    };
    const props = {
      store,
      statusFilter: "new" as const,
      typeFilter: "all" as const,
      page: 1,
      vaultFile: null,
      needsReview: { ok: true as const, predictions: [] },
      tenantSignals: { ok: true as const, rows: [] },
      cadenceAction: cadenceReviews,
    };
    const insights = renderToStaticMarkup(createElement(InsightsView, props));
    expect(insights).toContain("No chats yet");
    expect(insights).toContain("Upload chats");
    expect(insights).not.toContain("Sample is not loaded");

    const top = renderToStaticMarkup(
      createElement(InsightsView, { ...props, callToday: true }),
    );
    expect(top).toContain("No calls today");
    expect(top).toContain("Upload chats");

    const report = renderToStaticMarkup(
      await RevenueLeakReportView({
        store,
        backendScore: null,
        windowLabel: "This week",
        anonymised: true,
      }),
    );
    expect(report).toContain("No retention signals in this pilot file.");
  });
});
