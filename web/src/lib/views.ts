import {
  cadenceActionView,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";
import type { FeedbackLabel } from "@/lib/types";

export type PlatformView = "insights" | "upload" | "eval" | "taxonomy";

export type EvalPanel = "metrics" | "adapt" | "labeled" | "export";

export type WorkspaceMode = "shadow" | "action";

export type StatusFilter = "all" | "new" | "followup" | "acted";

export type SignalReviewTriage = {
  isPendingReview: boolean;
  nextPendingPreviewId: string | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode;
};

export type TypeFilter = "all" | "lead" | "retention" | "upsell";
export type LabeledTab = "byType" | "conversations";

const VIEWS: PlatformView[] = ["insights", "upload", "eval", "taxonomy"];
const EVAL_PANELS: EvalPanel[] = ["metrics", "adapt", "labeled", "export"];
const STATUS_FILTERS: StatusFilter[] = ["all", "new", "followup", "acted"];
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

/** Unlocked locally / via flag so Action Mode is designable; prod stays locked. */
export function isActionModeUnlocked(): boolean {
  if (process.env.NEXT_PUBLIC_ACTION_MODE_UNLOCKED === "true") return true;
  return process.env.NODE_ENV === "development";
}

export function parseMode(raw?: string | null): WorkspaceMode {
  if (raw === "action") return "action";
  return "shadow";
}

/**
 * Resolve workspace mode after the unlock gate.
 * Locked + `?mode=action` → Shadow (caller should also strip `mode` from the URL).
 */
export function resolveWorkspaceMode(
  raw?: string | null,
  unlocked: boolean = isActionModeUnlocked()
): WorkspaceMode {
  const mode = parseMode(raw);
  if (mode === "action" && !unlocked) return "shadow";
  return mode;
}

export function parseStatusFilter(
  raw?: string | null,
  mode: WorkspaceMode = "shadow"
): StatusFilter {
  if (raw === "reviewed") return "followup";
  if (raw && (STATUS_FILTERS as string[]).includes(raw)) {
    return raw as StatusFilter;
  }
  // Action Mode defaults to Follow-up when status is omitted.
  if (mode === "action") return "followup";
  return "all";
}

/**
 * Insights list landing when `status` is omitted from the URL.
 * Explicit filters always win (Filters → Needs Follow-Up stays empty-compact).
 * Omitted + pending work with empty Follow-up → Pending (`new`) so Neon
 * needs-review rows are not hidden behind a full-height empty Follow-up panel.
 */
export function resolveInsightsStatusFilter(opts: {
  raw?: string | null;
  mode: WorkspaceMode;
  pendingCount: number;
  followUpCount: number;
}): StatusFilter {
  const raw = opts.raw;
  const hasExplicit =
    raw === "reviewed" ||
    (typeof raw === "string" &&
      raw !== "" &&
      (STATUS_FILTERS as string[]).includes(raw));
  // Unknown non-empty raw still goes through parseStatusFilter (Shadow → all).
  if (hasExplicit || (typeof raw === "string" && raw !== "")) {
    return parseStatusFilter(raw, opts.mode);
  }
  if (opts.pendingCount > 0 && opts.followUpCount === 0) {
    return "new";
  }
  if (opts.mode === "action") return "followup";
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

/**
 * Insights Act Mode deep-link. Omits `status` so page landing can prefer
 * Pending when Follow-up is empty; otherwise Action defaults to Follow-up.
 * Only use when Action Mode is unlocked.
 */
export function actionModeHref(
  extras?: Record<string, string | undefined | null>
): string {
  return viewHref("insights", {
    ...extras,
    mode: "action",
    status: null,
  });
}

/**
 * Status query value for Insights links.
 * Action Mode must write `status=all` explicitly so omitted status does not
 * collapse back to Follow-up via `parseStatusFilter`.
 */
export function statusQueryValue(
  status: StatusFilter,
  mode: WorkspaceMode = "shadow"
): string | null {
  if (status === "all") return mode === "action" ? "all" : null;
  return status;
}

/** Cadence CTA href — Acted deep-links to the first Correct follow-up panel. */
export function cadenceActionHref(
  action: PilotCadenceAction,
  extras?: { scoreFrom?: string | null; preview?: string | null }
): string {
  if (action.id === "acted") {
    return viewHref("insights", {
      scoreFrom: extras?.scoreFrom,
      status: "followup",
      preview: extras?.preview,
    });
  }
  return viewHref(cadenceActionView(action), { scoreFrom: extras?.scoreFrom });
}

/** Next needs-review id after `currentId` (wraps; excludes current). */
export function nextPendingPreviewId(
  pending: { id: string }[],
  currentId: string,
): string | null {
  const n = pending.length;
  if (n === 0) return null;
  const start = pending.findIndex((s) => s.id === currentId);
  if (start < 0) return null;
  for (let i = 1; i <= n; i++) {
    const signal = pending[(start + i) % n];
    if (signal.id !== currentId) return signal.id;
  }
  return null;
}

/** Insights pending queue deep-link after feedback or Mark Acted. */
function pendingReviewQueueHref(opts: {
  nextPreviewId?: string | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
}): string {
  const modeExtra =
    opts.mode === "action" ? ({ mode: "action" } as const) : {};
  if (opts.nextPreviewId) {
    return viewHref("insights", {
      ...modeExtra,
      scoreFrom: opts.scoreFrom,
      status: "new",
      preview: opts.nextPreviewId,
    });
  }
  return viewHref("insights", {
    ...modeExtra,
    scoreFrom: opts.scoreFrom,
    status: "new",
  });
}

/**
 * After SignalScore feedback on a pending review.
 * Correct → Follow-up Act panel for the same signal (`status=followup&preview=`).
 * Incorrect / Partially Correct → next needs-review panel, or Pending list.
 * Null when the reviewer should stay (re-edit, Follow-up / Done origin).
 */
export function afterFeedbackHref(opts: {
  wasPending: boolean;
  /** Feedback label just saved — Correct stays on this signal’s Follow-up. */
  label?: FeedbackLabel | null;
  /** Current pending signal id (Correct Follow-up preview). */
  currentSignalId?: string | null;
  nextPendingPreviewId?: string | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
}): string | null {
  if (!opts.wasPending) return null;
  const modeExtra =
    opts.mode === "action" ? ({ mode: "action" } as const) : {};
  if (opts.label === "correct" && opts.currentSignalId) {
    return viewHref("insights", {
      ...modeExtra,
      scoreFrom: opts.scoreFrom,
      status: "followup",
      preview: opts.currentSignalId,
    });
  }
  return pendingReviewQueueHref({
    nextPreviewId: opts.nextPendingPreviewId,
    scoreFrom: opts.scoreFrom,
    mode: opts.mode,
  });
}

/**
 * After Mark as Acted on a Correct review.
 * Follow-up Act queue (`statusFilter=followup`): next Correct panel, or Follow-up list.
 * Pending / All / Done origin: next pending preview, or Pending list (`status=new`).
 * Null → stay and refresh.
 */
export function afterMarkActedHref(opts: {
  acted: boolean;
  feedbackLabel?: string | null;
  nextPreviewId?: string | null;
  nextPendingPreviewId?: string | null;
  statusFilter?: StatusFilter | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
}): string | null {
  if (!opts.acted || opts.feedbackLabel !== "correct") return null;
  const modeExtra =
    opts.mode === "action" ? ({ mode: "action" } as const) : {};
  if (opts.statusFilter === "followup") {
    if (opts.nextPreviewId) {
      return viewHref("insights", {
        ...modeExtra,
        scoreFrom: opts.scoreFrom,
        status: "followup",
        preview: opts.nextPreviewId,
      });
    }
    return viewHref("insights", {
      ...modeExtra,
      scoreFrom: opts.scoreFrom,
      status: "followup",
    });
  }
  if (opts.nextPendingPreviewId) {
    return pendingReviewQueueHref({
      nextPreviewId: opts.nextPendingPreviewId,
      scoreFrom: opts.scoreFrom,
      mode: opts.mode,
    });
  }
  return pendingReviewQueueHref({
    scoreFrom: opts.scoreFrom,
    mode: opts.mode,
  });
}
