import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { StoreData } from "@/lib/types";
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

    expect(html).not.toContain("Labeled Eval");
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
    expect(html).toContain("Open Insights");
    expect(html).toContain("Pilot");
    expect(html).not.toContain("Labeled Eval");
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
    expect(html).toContain("Lift vs baseline");
    expect(html).toContain("0 found − 12 baseline");
    expect(html).toContain("Open Insights");
    expect(html).not.toContain("Insufficient Data");
  });

  it("empty baseline hints partners to set share-out baseline", () => {
    const html = renderToStaticMarkup(
      createElement(EvalView, {
        store: { ...store, pilot: { baselineOpportunities: 0 } },
        scoreWindow,
        cadenceAction: cadenceReviews,
        backendScore: emptyScore,
      }),
    );

    expect(html).toContain("Lift vs baseline");
    expect(html).toContain("Set partner baseline for share-out");
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
    expect(html).toContain("Open Insights");
    expect(html).toContain("/?view=insights");
    expect(html).not.toContain("use Adapt");
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toContain("Labeled Eval");
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

    expect(html).toContain("Labeled Eval");
    expect(html).toContain("Precision By Signal Type");
    expect(html).not.toContain("n / ≥5");
    expect(html).not.toContain("use Adapt");
  });
});
