import {
  cadenceActionView,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";

export type PlatformView = "insights" | "upload" | "eval" | "taxonomy";

export type EvalPanel = "metrics" | "adapt" | "labeled" | "export";

export type StatusFilter = "all" | "new" | "reviewed";
export type TypeFilter = "all" | "lead" | "retention" | "upsell";
export type LabeledTab = "byType" | "conversations";

const VIEWS: PlatformView[] = ["insights", "upload", "eval", "taxonomy"];
const EVAL_PANELS: EvalPanel[] = ["metrics", "adapt", "labeled", "export"];
const STATUS_FILTERS: StatusFilter[] = ["all", "new", "reviewed"];
const TYPE_FILTERS: TypeFilter[] = ["all", "lead", "retention", "upsell"];
const LABELED_TABS: LabeledTab[] = ["byType", "conversations"];

export function parseView(raw?: string | null): PlatformView {
  if (raw && (VIEWS as string[]).includes(raw)) return raw as PlatformView;
  return "insights";
}

export function parseEvalPanel(raw?: string | null): EvalPanel {
  if (raw && (EVAL_PANELS as string[]).includes(raw)) return raw as EvalPanel;
  return "metrics";
}

export function parseStatusFilter(raw?: string | null): StatusFilter {
  if (raw && (STATUS_FILTERS as string[]).includes(raw)) {
    return raw as StatusFilter;
  }
  return "all";
}

export function parseTypeFilter(raw?: string | null): TypeFilter {
  if (raw && (TYPE_FILTERS as string[]).includes(raw)) {
    return raw as TypeFilter;
  }
  return "all";
}

export function parseLabeledTab(raw?: string | null): LabeledTab {
  if (raw && (LABELED_TABS as string[]).includes(raw)) {
    return raw as LabeledTab;
  }
  return "byType";
}

export function parsePage(raw?: string | null, fallback = 1): number {
  const n = raw ? Number(raw) : fallback;
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.floor(n);
}

export function viewHref(
  view: PlatformView,
  extras?: Record<string, string | undefined | null>
): string {
  const params = new URLSearchParams();
  params.set("view", view);
  if (extras) {
    for (const [key, value] of Object.entries(extras)) {
      if (value != null && value !== "") params.set(key, value);
    }
  }
  return `/?${params.toString()}`;
}

/** Cadence CTA href — Acted deep-links to the first Correct review panel. */
export function cadenceActionHref(
  action: PilotCadenceAction,
  extras?: { scoreFrom?: string | null; preview?: string | null }
): string {
  if (action.id === "acted") {
    return viewHref("insights", {
      scoreFrom: extras?.scoreFrom,
      status: "reviewed",
      preview: extras?.preview,
    });
  }
  return viewHref(cadenceActionView(action), { scoreFrom: extras?.scoreFrom });
}

/**
 * After Mark as Acted on a Correct review: next Correct panel, or Insights
 * queue (next-week upsert) when none remain. Null → stay and refresh.
 */
export function afterMarkActedHref(opts: {
  acted: boolean;
  feedbackLabel?: string | null;
  nextPreviewId?: string | null;
  scoreFrom?: string | null;
}): string | null {
  if (!opts.acted || opts.feedbackLabel !== "correct") return null;
  if (opts.nextPreviewId) {
    return viewHref("insights", {
      scoreFrom: opts.scoreFrom,
      status: "reviewed",
      preview: opts.nextPreviewId,
    });
  }
  return viewHref("insights", { scoreFrom: opts.scoreFrom });
}
