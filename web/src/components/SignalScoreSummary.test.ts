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

describe("SignalScoreSummary compact", () => {
  it("uses EvalCard chrome with aligned header and KPI gutters", () => {
    const html = renderToStaticMarkup(
      createElement(SignalScoreSummary, {
        score: emptyScore,
        compact: true,
        windowLabel: "Last 7 days",
      }),
    );

    expect(html).toContain("data-slot=\"card\"");
    expect(html).toContain("Signal Score");
    expect(html).toContain("Last 7 days · Neon");
    expect(html).toContain("px-3 py-2.5 sm:px-4");
    expect(html).toContain("min-w-0 px-3 py-2.5 sm:px-4");
    expect(html).toContain("grid-cols-5");
    expect(html).toContain("data-slot=\"separator\"");
    expect(html).not.toContain("metric-strip--compact");
    expect(html).not.toContain("px-1.5");
  });
});
