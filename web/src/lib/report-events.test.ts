import { expect, it } from "vitest";
import { scopeReportEvents } from "./report-events";
import type { Signal } from "./types";
it("uses independent event timestamps with inclusive boundaries", () => {
  const signal = { id: "s", createdAt: "2025-01-01", feedback: { label: "correct", reviewedAt: "2026-10-01T00:00:00Z" },
    outcome: { outcome: "retained", recordedAt: "2026-10-04T23:59:59.999Z", valueInr: 1200 } } as Signal;
  const result = scopeReportEvents([signal], "2026-10-01T00:00:00Z", "2026-10-04T23:59:59.999Z")[0];
  expect(result.feedback).toEqual(signal.feedback);
  expect(result.outcome).toEqual(signal.outcome);
  expect(scopeReportEvents([signal], "2026-10-02", "2026-10-03")[0]).toMatchObject({ feedback: undefined, outcome: undefined });
  expect(signal.outcome?.valueInr).toBe(1200);
});
it("does not count undated or malformed outcomes in a dated report", () => {
  const signals = [{ outcome: { outcome: "retained", valueInr: 100 } },
    { outcome: { outcome: "retained", recordedAt: "bad", valueInr: 200 } }] as Signal[];
  expect(scopeReportEvents(signals, "2026-10-01").every((signal) => !signal.outcome)).toBe(true);
});
