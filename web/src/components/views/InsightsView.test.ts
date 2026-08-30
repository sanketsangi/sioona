import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StoreData, Signal } from "@/lib/types";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: unknown;
    className?: string;
  }) =>
    createElement("a", { href, className }, children as never),
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

import { InsightsView } from "./InsightsView";

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
  label: "Mark ≥5 SignalScore reviews",
};

const cadenceMidweek = {
  id: "midweek" as const,
  label: "Mid-week — Re-upload weekly export",
};

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
      })
    );

    expect(html).toContain("Conversation that needs your attention");
    expect(html).toContain("Queue metrics");
    expect(html).toContain("Pending signal 1");
    expect(html).toContain("Pending signal 10");
    expect(html).toContain('data-slot="card"');
    expect(html).toContain("preview=sig_1");
    expect(html).toContain(">Review</a>");
    expect(html).not.toContain("No Signals Need Follow-Up");
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
      })
    );

    expect(html).toContain("No Correct Signals");
    expect(html).toContain("Review pending detections first.");
    expect(html).toContain("Review Pending");
    expect(html).toContain("status=new");
    expect(html).not.toContain("Upload Weekly Export");
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
      })
    );

    expect(html).toContain("No Signals Need Review");
    expect(html).toContain("Upload Weekly Export");
    expect(html).toMatch(/upsert/i);
    expect(html).toContain('data-slot="card"');
    expect(html).toContain(
      "flex flex-1 flex-col items-center justify-center",
    );
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
      })
    );

    expect(html).toContain("Review Queue Unavailable");
    expect(html).toContain("the service may be waking up");
    expect(html).toContain("Retry Queue");
    expect(html).toContain('data-slot="card"');
    expect(html).toContain('role="alert"');
    expect(html).not.toMatch(/Start FastAPI|from Neon|BACKEND_URL/);
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
      })
    );

    expect(html).toContain("Follow-Up Queue Unavailable");
    expect(html).toContain("the service may be waking up");
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

    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Why This Fired");
    expect(html).toContain("Follow up");
    expect(html).toContain("Please pause my SIP this month");
    expect(html).not.toContain("See Conversation");
    expect(html).toContain("Open Conversation");
    expect(html).toContain("Conversation");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("Show in conversation: Please pause my SIP this month");
    expect(html).not.toContain("A / Enter → Mark as Acted");
  });

  it("shows rail Mark as Acted on Follow-up Correct preview", () => {
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

    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Mark as Acted");
    expect(html).toContain("btn-primary");
    expect(html).not.toContain("Display only — not sent.");
    expect(html).toContain("A / Enter → Mark as Acted on Suggested Next Action");
    expect(html).not.toContain("Mark as Pending");
    expect(html).toContain("Open Conversation");
    expect(html).toContain("data-review-keyboard-root");
  });

  it("shows the Act cue on Correct ¬acted Follow-up", () => {
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

    expect(html).toContain("Mark as Acted on Suggested Next Action (does not send).");
    expect(html).toContain("Mark as Acted");
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
    expect(html).toContain("Conversation");
    expect(html).toContain("Feedback");
    expect(html).toContain("insights-review-split");
    expect(html).toContain('data-review-slot="transcript"');
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
    expect(html).toContain("Suggested Next Action");
    expect(html).toContain("Matched");
    expect(html).not.toContain("Why This Fired");
    expect(html).toContain("Feedback");
    expect(html).toContain("insights-review-split");
  });
});
