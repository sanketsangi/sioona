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

/**
 * True when this is a real partner-set baseline (Eval share-out), not the
 * cold-demo 4 and not an unset 0 with no note.
 */
export function isPartnerBaseline(
  baselineOpportunities: number,
  baselineNote?: string | null
): boolean {
  if (isColdDemoBaseline(baselineOpportunities, baselineNote)) return false;
  return (
    baselineOpportunities > 0 || Boolean(baselineNote?.trim())
  );
}

/** Unset (0, no note) or cold-demo — safe to heal from Neon partner baseline. */
export function isUnsetOrColdDemoBaseline(
  baselineOpportunities: number,
  baselineNote?: string | null
): boolean {
  if (isColdDemoBaseline(baselineOpportunities, baselineNote)) return true;
  return baselineOpportunities === 0 && !baselineNote?.trim();
}