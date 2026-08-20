/**
 * Cold-demo “their process” estimate — intentionally below Sioona’s find rate
 * so Insights can show missed vs found without a real partner baseline.
 */
export const DEMO_BASELINE_OPPORTUNITIES = 4;
export const DEMO_BASELINE_NOTE =
  "Cold-demo estimate: what a busy desk typically flags without Shadow Mode. Replace with the partner’s real count on Eval.";

/** True when baseline matches the cold-demo pair (Partner Demo default). */
export function isColdDemoBaseline(
  baselineOpportunities: number,
  baselineNote?: string | null
): boolean {
  if (baselineOpportunities !== DEMO_BASELINE_OPPORTUNITIES) return false;
  const note = baselineNote?.trim() ?? "";
  return note === "" || note === DEMO_BASELINE_NOTE;
}