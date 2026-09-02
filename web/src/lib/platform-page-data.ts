import type { PlatformView } from "@/lib/views";

/** Which FastAPI reads the platform page should issue for `?view=`. */
export type PlatformPageFetches = {
  /** needs-review + tenant signals + overlay chats (Insights queue / Eval keep-set). */
  insightsQueue: boolean;
  /** Windowed SignalScore (`dateFrom`). Insights header + Eval metrics. */
  windowedScore: boolean;
  /** Unwindowed SignalScore. Eval quiet all-time only. */
  allTimeScore: boolean;
};

export function platformPageFetches(view: PlatformView): PlatformPageFetches {
  const insightsOrEval = view === "insights" || view === "eval";
  return {
    insightsQueue: insightsOrEval,
    windowedScore: insightsOrEval,
    allTimeScore: view === "eval",
  };
}
