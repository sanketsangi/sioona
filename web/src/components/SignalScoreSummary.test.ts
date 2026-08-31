import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SignalScoreSummary } from "@/components/SignalScoreSummary";
import type { BackendSignalScore } from "@/lib/backend-client";

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

describe("SignalScoreSummary compact", () => {
  it("uses EvalCard chrome with aligned header and KPI gutters", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: emptyScore,
        compact: true,
        windowLabel: "Last 7 days",
        goNoGo: "insufficient_data",
      }),
    );

    expect(html).toContain("data-slot=\"card\"");
    expect(html).toContain("Signal Score");
    expect(html).toContain("Last 7 days · Neon");
    expect(html).toContain("px-3 py-2.5 sm:px-4");
    expect(html).toContain("min-w-0 px-3 py-2.5 sm:px-4");
    expect(html).toContain("grid-cols-5");
    expect(html).toContain("data-slot=\"separator\"");
    expect(html).toContain("n / ≥5");
    expect(html).not.toContain("metric-strip--compact");
    expect(html).not.toContain("px-1.5");
  });

  it("empty window shows Insufficient Data, 0 / 5, and em dash Overall (never Go)", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: emptyScore,
        compact: true,
        windowLabel: "Last 7 days",
        goNoGo: "insufficient_data",
        cadence: createElement("span", null, "Open Insights"),
      }),
    );

    expect(html).toContain("Insufficient Data");
    expect(html).not.toContain(">Go<");
    expect(html).toContain("0 / 5");
    expect(html).toContain("Open Insights");
    expect(html).toMatch(/Overall[\s\S]*?—/);
    expect(html).not.toMatch(/Overall[\s\S]*?0%/);
  });

  it("go payload shows percent, n / ≥5, and Go verdict with cadence", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: goScore,
        compact: true,
        windowLabel: "Last 7 days",
        goNoGo: "go",
        cadence: createElement("span", null, "Mark as Acted"),
      }),
    );

    expect(html).toContain("Go");
    expect(html).not.toContain("Insufficient Data");
    expect(html).toContain("6 / 5");
    expect(html).toContain("83%");
    expect(html).toContain("Mark as Acted");
  });

  it("offline omits Go and shows em dash KPIs", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: null,
        compact: true,
        cadence: createElement("span", null, "Open Insights"),
      }),
    );

    expect(html).toContain("Backend offline");
    expect(html).not.toContain("Insufficient Data");
    expect(html).not.toContain(">Go<");
    expect(html).toContain("n / ≥5");
    expect(html).toContain("Open Insights");
  });
});
