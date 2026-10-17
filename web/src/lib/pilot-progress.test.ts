import { expect, it } from "vitest";
import { pilotProgress } from "./pilot-progress";
import { buildRevenueLeakReport } from "./revenue-leak";
const empty = () => buildRevenueLeakReport({ signals: [], conversations: [], messages: [], windowLabel: "All" });
it("does not manufacture completion for empty data or unrecorded human verification", () => {
  expect(pilotProgress(empty(), 0).every(step => !step.complete)).toBe(true);
});
it("uses persisted review and outcome counts while leaving visits unrecorded", () => {
  const report = empty(); report.precision.reviewed = 3; report.outcomes.saved = 1;
  expect(pilotProgress(report, 2).map(step => step.complete)).toEqual([true, false, true, true, false]);
  report.revenueVerified = false;
  expect(pilotProgress(report, 2)[2].complete).toBe(false);
});
