import type { PlatformView } from "@/lib/views";

/**
 * Cold-start dual-write `POST /v1/predictions`.
 * Never awaited on GET / (TTFB). Insights/Eval still dual-write after the
 * response so first paint can use GET needs-review / GET signals.
 */
export type PredictionSyncPlan = "skip" | "defer";

/**
 * `GET /v1/tenants/:id/pilot` on homepage SSR.
 * await — Upload cadence chrome (weeklyExportCount + filename) is first paint.
 * defer — Insights/Eval header filename + cadence helper use JSON; heal after().
 * skip — Taxonomy has no filename / cadence chrome.
 */
export type PilotRefreshPlan = "await" | "defer" | "skip";

/** Which FastAPI reads the platform page should issue for `?view=`. */
export type PlatformPageFetches = {
  /** needs-review + tenant signals + overlay chats (Insights queue / Eval keep-set). */
  insightsQueue: boolean;
  /** Windowed SignalScore (`dateFrom`). Insights header + Eval metrics. */
  windowedScore: boolean;
  /** Unwindowed SignalScore. Eval quiet all-time only. */
  allTimeScore: boolean;
  /**
   * `POST /v1/predictions` on JSON cold start (hydrate/seed).
   * skip — Upload/Taxonomy never display predictions.
   * defer — Insights/Eval need Neon rows eventually; do not block TTFB.
   */
  predictionSync: PredictionSyncPlan;
  /**
   * Neon `GET …/pilot` overlay onto JSON `store.pilot`.
   * await — Upload first paint (cadence + filename).
   * defer — Insights/Eval: stale JSON is fine for header / helper copy.
   * skip — Taxonomy.
   */
  pilotRefresh: PilotRefreshPlan;
};

export function platformPageFetches(view: PlatformView): PlatformPageFetches {
  const insightsOrEval = view === "insights" || view === "eval";
  return {
    insightsQueue: insightsOrEval,
    windowedScore: insightsOrEval,
    allTimeScore: view === "eval",
    predictionSync: insightsOrEval ? "defer" : "skip",
    pilotRefresh:
      view === "upload" ? "await" : insightsOrEval ? "defer" : "skip",
  };
}

/**
 * Schedule `POST /v1/predictions` only when Insights/Eval cold-started
 * (hydrate/seed). Warm `/tmp` reads already have JSON; Upload/Taxonomy skip.
 */
export function shouldDeferHomepagePredictionSync(
  plan: PredictionSyncPlan,
  coldStart: boolean
): boolean {
  return coldStart && plan === "defer";
}

/** Upload cadence chrome needs a live Neon overlay before first paint. */
export function shouldAwaitHomepagePilotRefresh(
  plan: PilotRefreshPlan
): boolean {
  return plan === "await";
}

/**
 * Insights/Eval heal `store.pilot` after the response so header filename
 * and cadence helper do not block TTFB. Taxonomy never schedules this.
 */
export function shouldDeferHomepagePilotRefresh(
  plan: PilotRefreshPlan
): boolean {
  return plan === "defer";
}
