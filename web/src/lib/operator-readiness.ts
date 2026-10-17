import { getEconomicsDashboard, getInferenceControls } from "./backend-client";
export function safeRevision(value: string | undefined): string | null {
  return value && /^[a-f0-9]{40}$/i.test(value) ? value : null;
}
export async function readOperatorReadiness(tenant: string) {
  const [controls, dashboard] = await Promise.allSettled([
    getInferenceControls(tenant),
    getEconomicsDashboard(tenant),
  ]);
  return {
    observedAt: new Date().toISOString(),
    revision: safeRevision(
      process.env.RENDER_GIT_COMMIT ??
        process.env.VERCEL_GIT_COMMIT_SHA ??
        process.env.SIOONA_RELEASE_SHA,
    ),
    controls: controls.status === "fulfilled" ? controls.value : null,
    ledger:
      dashboard.status === "fulfilled"
        ? {
            from: dashboard.value.from_ts,
            to: dashboard.value.to_ts,
            attempts: dashboard.value.economics.attempts,
            unfinished: dashboard.value.reliability.unfinished_attempts,
            unknownUsage: dashboard.value.economics.unknown_usage_count,
            unknownCost: dashboard.value.economics.unknown_cost_count,
            reservationDrift: dashboard.value.reliability.reservation_drift,
            flushFailures: dashboard.value.reliability.ledger_flush_failures,
          }
        : null,
  };
}
