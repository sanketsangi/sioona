import type { PlatformView } from "@/lib/views";

/**
 * Cold-start dual-write `POST /v1/predictions`.
 * Never awaited on GET / (TTFB). Insights/Eval still dual-write after the
 * response so first paint can use GET needs-review / GET signals.
 */
export type PredictionSyncPlan = "skip" | "defer";

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
};

export function platformPageFetches(view: PlatformView): PlatformPageFetches {
  const insightsOrEval = view === "insights" || view === "eval";
  return {
    insightsQueue: insightsOrEval,
    windowedScore: insightsOrEval,
    allTimeScore: view === "eval",
    predictionSync: insightsOrEval ? "defer" : "skip",
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
