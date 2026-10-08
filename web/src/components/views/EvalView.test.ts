import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Signal, StoreData } from "@/lib/types";
import type { SignalScoreWindow } from "@/lib/signal-score-window";
import type { BackendSignalScore } from "@/lib/backend-client";

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

import { EvalView } from "./EvalView";

const store: StoreData = {
  tenant: {
    id: "tenant_demo",
    name: "Demo",
    createdAt: "2026-01-01T00:00:00.000Z",
  },
  conversations: [],
  messages: [],
  signals: [],
  pilot: { baselineOpportunities: 12, weeklyExportCount: 4 },
};

const scoreWindow: SignalScoreWindow = {
  status: "default",
  resolvedFrom: "2026-08-23T00:00:00.000Z",
  dateInput: "2026-08-23",
  label: "Last 7 days",
};

const cadenceReviews = {
  id: "reviews" as const,
  label: "Mark ≥5 Corrects this window",
};

const emptyScore: BackendSignalScore = {
  tenant_id: "tenant_demo",
  reviewed_count: 0,
  correct_count: 0,
  incorrect_count: 0,
  partially_correct_count: 0,
  signal_score: 0,
  by_signal_type: [],
};

const goScore: BackendSignalScore = {
  tenant_id: "tenant_demo",
  reviewed_count: 6,
  correct_count: 5,
  incorrect_count: 1,
  partially_correct_count: 0,
  signal_score: 0.83,
  by_signal_type: [],
  first_reviewed_at: "2026-08-24T09:15:00.000Z",
  last_reviewed_at: "2026-08-28T16:40:00.000Z",
};

const holdScore: BackendSignalScore = {
  tenant_id: "tenant_demo",
  reviewed_count: 6,
  correct_count: 3,
  incorrect_count: 3,
  partially_correct_count: 0,
  signal_score: 0.5,
  by_signal_type: [],
};

function signal(conversationId: string): Signal {
  return {
    id: `sig_${conversationId}`,
    tenantId: "tenant_demo",
    conversationId,
    type: "lead",
    score: 0.9,
    confidence: 0.9,
    summary: "Opportunity",
    suggestedAction: "Follow up",
    evidence: [],
    status: "new",
    createdAt: "2026-08-23T00:00:00.000Z",
  };
}

describe("EvalView metrics containers", () => {
  it("aligns Metrics wells on EvalCard gutters", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).not.toContain("Measures the labeled pack.");
    expect(html).toContain("Pilot");
    expect(html).toContain("Set Partner Baseline");
    expect(html).toContain("data-slot=\"card\"");
    expect(html).toContain("px-3 py-2.5 sm:px-4");
    expect(html).not.toContain("metric-strip");
    expect(html).not.toContain("surface-quiet");
    expect(html).not.toContain("px-1.5");
  });

  it("first fold is keep-set cockpit with n/≥5, verdict, and cadence CTA", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).toContain("This Week");
    expect(html).toContain("n / ≥5");
    expect(html).toContain("0 / 5");
    expect(html).toContain("Insufficient Data");
    expect(html).not.toContain("First review");
    expect(html).not.toContain("Last review");
    expect(html).toContain("Open Insights");
    expect(html).toContain("Pilot");
    expect(html).not.toContain("Measures the labeled pack.");
    expect(html).not.toContain("Insights pilot: Shadow Mode queue");
    expect(html).not.toContain("use Adapt");
  });

  it("Go window surfaces share-out score and cadence on first fold", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: goScore,
      }),
    );

    expect(html).toContain("Go");
    expect(html).toContain("6 / 5");
    expect(html).toContain("83%");
    expect(html).toContain("First review");
    expect(html).toContain("24 Aug 2026, 09:15");
    expect(html).toContain("Last review");
    expect(html).toContain("28 Aug 2026, 16:40");
    expect(html).toContain("2026-08-24T09:15:00.000Z");
    expect(html).toContain("2026-08-28T16:40:00.000Z");
    expect(html).toContain("Lift vs baseline");
    expect(html).toContain("0 found − 12 baseline");
    expect(html).toContain("Open Insights");
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toContain("P Target");
    expect(html).not.toContain("80%");
  });

  it("empty window does not invent review times from a stray payload", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: {
          ...emptyScore,
          first_reviewed_at: "2026-08-24T09:15:00.000Z",
          last_reviewed_at: "2026-08-28T16:40:00.000Z",
        },
      }),
    );

    expect(html).toContain("Insufficient Data");
    expect(html).not.toContain("First review");
    expect(html).not.toContain("24 Aug 2026");
  });

  it("lift 0 still renders the found − baseline comparison", () => {
    const matched = signal("c1");
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: {
          ...store,
          signals: [matched, { ...matched, id: "sig_c2", conversationId: "c2" }],
          pilot: { baselineOpportunities: 2 },
        },
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: goScore,
      }),
    );

    expect(html).toContain("Lift vs baseline");
    expect(html).toContain("+0");
    expect(html).toContain("2 found − 2 baseline");
    expect(html).not.toContain("Set partner baseline for share-out");
    expect(html).not.toContain("P Target");
  });

  it("zero baseline still renders the found − baseline comparison", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: { ...store, pilot: { baselineOpportunities: 0 } },
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).toContain("Lift vs baseline");
    expect(html).toContain("+0");
    expect(html).toContain("0 found − 0 baseline");
  });

  it("offline cockpit omits fixture Go and still shows cadence CTA", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: null,
      }),
    );

    expect(html).toContain("Backend offline");
    expect(html).toContain("Open Insights");
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toMatch(/Pilot[\s\S]*?>Go</);
  });

  it("Hold points to Insights reviews, not Adapt phrase tuning", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: holdScore,
      }),
    );

    expect(html).toContain("Hold");
    expect(html).not.toContain("First review");
    expect(html).not.toContain("Last review");
    expect(html).toContain("Open Insights");
    expect(html).toContain("/?view=insights");
    expect(html).not.toContain("use Adapt");
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toContain("Measures the labeled pack.");
  });

  it("shows the sync warning when uploaded chats and saved reviews disagree", () => {
    const saved = {
      ...signal("c1"),
      feedback: {
        label: "correct" as const,
        reviewedAt: "2026-08-24T00:00:00.000Z",
      },
    };
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: {
          ...store,
          conversations: [
            {
              id: "c1",
              tenantId: "tenant_demo",
              channel: "whatsapp",
              startedAt: "2026-08-01T00:00:00.000Z",
              messageIds: [],
            },
          ],
          signals: [saved],
        },
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).toContain("1 prediction not synced");
    expect(html).toContain(
      "Those reviews will not count on Eval until sync succeeds",
    );
    expect(html).toContain('role="alert"');
  });

  it("stays quiet when saved reviews already match an empty Neon window", () => {
    const saved = {
      ...signal("c1"),
      backendSignalId: "pred-1",
      feedback: {
        label: "correct" as const,
        reviewedAt: "2026-08-24T00:00:00.000Z",
      },
    };
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: {
          ...store,
          conversations: [
            {
              id: "c1",
              tenantId: "tenant_demo",
              channel: "whatsapp",
              startedAt: "2026-08-01T00:00:00.000Z",
              messageIds: [],
            },
          ],
          signals: [saved],
        },
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).not.toContain("not synced");
  });

  it("Adapt does not show a JSON quote the server could not reconstruct", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: {
          ...store,
          signals: [
            {
              ...signal("c1"),
              evidence: ['quote: "Please pause my SIP this month"'],
              feedback: {
                label: "incorrect",
                reviewedAt: "2026-08-24T00:00:00.000Z",
              },
            },
          ],
        },
        panelRaw: "adapt",
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).not.toContain("Please pause my SIP this month");
    expect(html).toContain("No evidence");
  });

  it("Adapt still shows a reconstructed quote marked valid", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: {
          ...store,
          signals: [
            {
              ...signal("c1"),
              evidence: ['quote: "Please pause my SIP"'],
              evidenceStatus: "valid",
              feedback: {
                label: "incorrect",
                reviewedAt: "2026-08-24T00:00:00.000Z",
              },
            },
          ],
        },
        panelRaw: "adapt",
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).toContain("Please pause my SIP");
    expect(html).not.toContain("No evidence");
  });

  it("labeled panel owns P/R, not Metrics", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store,
        panelRaw: "labeled",
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).toContain("Labeled pack");
    expect(html).toContain("Measures the labeled pack.");
    expect(html).toContain("Precision By Signal Type");
    expect(html).not.toContain("n / ≥5");
    expect(html).not.toContain("use Adapt");
  });
});
