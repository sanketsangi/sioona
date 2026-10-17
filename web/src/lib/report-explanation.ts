import type { RevenueLeakReport } from "./revenue-leak";

/** Shared report/PDF semantics; this never changes monetary calculations. */
export function reportExplanation(report: RevenueLeakReport): string[] {
  const missing = report.customersAtRisk.filter(row => row.valueInr == null).length;
  return [
    report.demo ? "Demo workspace. Data and recorded outcomes are simulated; not customer results." : "Outcomes are reviewer-recorded; independent commercial verification is not established.",
    report.revenueVerified === false ? "Persisted review and saved-value totals are unavailable." : `Precision: ${report.precision.correct} correct / ${report.precision.reviewed} reviewed. Partial reviews remain in the denominator.`,
    `${missing} retention signals have no stated monetary value. Missing values are not zero-value customers.`,
    "Exposure is estimated. Confirmed saved means reviewer-recorded saved value, not independently verified revenue.",
  ];
}
