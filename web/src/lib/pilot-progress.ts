import type { RevenueLeakReport } from "./revenue-leak";

/** Completion uses persisted aggregate results, never visits or local browser state. */
export function pilotProgress(report: RevenueLeakReport, conversationCount: number) {
  const outcomes = report.outcomes.saved + report.outcomes.lost + report.outcomes.converted;
  return [
    { label: "Upload", detail: `${Intl.NumberFormat().format(conversationCount)} conversations in this corpus`, complete: conversationCount > 0, destination: "upload" },
    { label: "Verify source", detail: "Open a source quote; human verification is not recorded", complete: false, destination: "insights" },
    { label: "Review signals", detail: report.revenueVerified === false ? "Review counts unavailable" : `${Intl.NumberFormat().format(report.precision.reviewed)} persisted reviews`, complete: report.revenueVerified !== false && report.precision.reviewed > 0, destination: "insights" },
    { label: "Record outcomes", detail: `${Intl.NumberFormat().format(outcomes)} saved, lost or converted records`, complete: outcomes > 0, destination: "report" },
    { label: "Executive report", detail: "Available below; opening it does not record completion", complete: false, destination: "report" },
  ] as const;
}
