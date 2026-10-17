import { expect, it } from "vitest";
import { buildRevenueLeakReport } from "./revenue-leak";
import { reportExplanation } from "./report-explanation";
import { revenueLeakPdfLines } from "./revenue-leak-pdf";
it("shares demo and denominator definitions with PDF without changing totals", () => {
  const report = buildRevenueLeakReport({ signals: [], conversations: [], messages: [], windowLabel: "All", reviewed: 4, correct: 2 });
  report.demo = true;
  const before = JSON.stringify(report);
  const explanation = reportExplanation(report);
  expect(explanation[0]).toContain("simulated");
  expect(explanation[1]).toContain("2 correct / 4 reviewed");
  expect(revenueLeakPdfLines(report)).toEqual(expect.arrayContaining(explanation));
  expect(JSON.stringify(report)).toBe(before);
  report.demo = false; report.revenueVerified = false;
  expect(reportExplanation(report)[0]).toContain("independent commercial verification is not established");
  expect(reportExplanation(report)[1]).toContain("unavailable");
});
