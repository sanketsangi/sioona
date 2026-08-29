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
    expect(html).toContain("Pending signal 1");
    expect(html).toContain("Pending signal 10");
    expect(html).not.toContain("No Signals Need Follow-Up");
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
    expect(html).toContain(
      "panel flex flex-1 flex-col items-center justify-center",
    );
    expect(html).not.toContain("Review Pending");
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

    expect(html).toContain("No Signals Need Review");
    expect(html).not.toContain("Leftover Groww pending");
  });
});
