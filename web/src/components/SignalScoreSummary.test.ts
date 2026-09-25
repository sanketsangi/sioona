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

  it("overall percent follows counts when the score float lies", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: {
          tenant_id: "tenant_demo",
          reviewed_count: 6,
          correct_count: 3,
          incorrect_count: 3,
          partially_correct_count: 0,
          signal_score: 1,
          by_signal_type: [],
        },
        compact: true,
        goNoGo: "hold",
      }),
    );

    expect(html).toContain("50%");
    expect(html).not.toContain("100%");
    expect(html).toContain("Hold");
  });

  it("hold verdict shows Hold and cadence, never Adapt", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: {
          tenant_id: "tenant_demo",
          reviewed_count: 6,
          correct_count: 3,
          incorrect_count: 3,
          partially_correct_count: 0,
          signal_score: 0.5,
          by_signal_type: [],
        },
        compact: true,
        goNoGo: "hold",
        cadence: createElement("span", null, "Open Insights"),
      }),
    );

    expect(html).toContain("Hold");
    expect(html).toContain("Open Insights");
    expect(html).toContain("6 / 5");
    expect(html).not.toContain("use Adapt");
    expect(html).not.toContain("Insufficient Data");
  });

  it("keeps Overall distinct from by-signal-type chips", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: {
          tenant_id: "tenant_demo",
          reviewed_count: 8,
          correct_count: 8,
          incorrect_count: 0,
          partially_correct_count: 0,
          signal_score: 1,
          by_signal_type: [
            {
              signal_type: "lead",
              signal_score: 1,
              reviewed_count: 3,
              correct_count: 3,
              incorrect_count: 0,
              partially_correct_count: 0,
            },
            {
              signal_type: "retention",
              signal_score: 1,
              reviewed_count: 5,
              correct_count: 5,
              incorrect_count: 0,
              partially_correct_count: 0,
            },
          ],
        },
        compact: true,
        goNoGo: "go",
      }),
    );

    expect(html).toMatch(/Overall[\s\S]*?100%/);
    expect(html).toContain("8 / 5");
    expect(html).toContain("(3/3)");
    expect(html).toContain("(5/5)");
  });

  it("empty all-time pack is an em dash, never 0%", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: goScore,
        compact: true,
        goNoGo: "go",
        allTimeScore: {
          ...emptyScore,
          signal_score: 0,
        },
      }),
    );

    expect(html).toMatch(/All-time pack[\s\S]{0,80}—/);
    expect(html).not.toMatch(/All-time pack[\s\S]{0,80}0%/);
  });

  it("hides Go when label counts do not sum to reviewed", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: {
          tenant_id: "tenant_demo",
          reviewed_count: 6,
          correct_count: 6,
          incorrect_count: 1,
          partially_correct_count: 0,
          signal_score: 1,
          by_signal_type: [],
        },
        compact: true,
        goNoGo: "go",
      }),
    );

    expect(html).not.toContain(">Go<");
    expect(html).not.toContain("100%");
    expect(html).toMatch(/Overall[\s\S]*?—/);
  });
});
