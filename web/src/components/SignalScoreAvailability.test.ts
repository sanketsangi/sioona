import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { SignalScoreSummary } from "./SignalScoreSummary";
import type { BackendSignalScore } from "@/lib/backend-client";
it("does not present unknown monetary totals as zero", () => {
  const score = { reviewed_count: 1, correct_count: 1, incorrect_count: 0, partially_correct_count: 0, signal_score: 1, by_signal_type: [], revenue_at_risk_found_inr: null, revenue_saved_inr: null } as unknown as BackendSignalScore;
  const html = renderToStaticMarkup(createElement(SignalScoreSummary, { score, compact: true }));
  expect((html.match(/Unavailable/g) ?? []).length).toBeGreaterThanOrEqual(2);
});
