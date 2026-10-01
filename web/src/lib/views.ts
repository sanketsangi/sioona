import {
  cadenceActionView,
  type PilotCadenceAction,
} from "@/lib/pilot-cadence";
import type { FeedbackLabel } from "@/lib/types";

export type PlatformView = "insights" | "upload" | "eval" | "taxonomy" | "report";

export type EvalPanel = "metrics" | "adapt" | "labeled" | "export";

export type WorkspaceMode = "shadow" | "action";

export type StatusFilter = "all" | "new" | "followup" | "acted";

/** Queue CTA filter — Approve (supervised draft) vs Review. */
export type ActionFilter = "all" | "approve" | "review";

export type SignalReviewTriage = {
  isPendingReview: boolean;
  prevPendingPreviewId: string | null;
  nextPendingPreviewId: string | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode;
  /** Replace-ingest landing — keep leftover Neon overlay off. */
  replaced?: boolean;
  /** Preserve queue type filter on feedback / walk advances. */
  typeFilter?: TypeFilter;
  /** Preserve Approve / Review CTA filter on feedback / walk advances. */
  actionFilter?: ActionFilter;
  /** Preserve Vault `?file=` scope on feedback / walk advances. */
  file?: string | null;
};

export type TypeFilter = "all" | "lead" | "retention" | "upsell";
export type LabeledTab = "byType" | "conversations";

const VIEWS: PlatformView[] = ["insights", "upload", "eval", "taxonomy", "report"];
const EVAL_PANELS: EvalPanel[] = ["metrics", "adapt", "labeled", "export"];
const STATUS_FILTERS: StatusFilter[] = ["all", "new", "followup", "acted"];
const ACTION_FILTERS: ActionFilter[] = ["all", "approve", "review"];
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

/** Upload replace landing: JSON chats are the keep-set until Neon prune finishes. */
export function parseReplacedParam(raw?: string | null): boolean {
  return raw === "1" || raw === "true";
}

export function replacedQueryValue(
  replaced?: boolean | null
): string | null {
  return replaced ? "1" : null;
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
 * Omitted status is never remapped to Pending — Shadow defaults to All,
 * Action defaults to Follow-up via `parseStatusFilter`.
 */
export function resolveInsightsStatusFilter(opts: {
  raw?: string | null;
  mode: WorkspaceMode;
}): StatusFilter {
  return parseStatusFilter(opts.raw, opts.mode);
}

export function parseTypeFilter(raw?: string | null): TypeFilter {
  if (raw && (TYPE_FILTERS as string[]).includes(raw)) {
    return raw as TypeFilter;
  }
  return "all";
}

export function parseActionFilter(raw?: string | null): ActionFilter {
  if (raw && (ACTION_FILTERS as string[]).includes(raw)) {
    return raw as ActionFilter;
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
 * Insights Act Mode deep-link. Omits `status` so Action defaults to Follow-up
 * via `parseStatusFilter`. Only use when Action Mode is unlocked.
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
 * Shadow Mode toggle href — keep view/filters, strip `mode` and `preview`.
 * Omitting `preview` matches Action Mode (list landing) and avoids ModeToggle
 * hydration mismatches when SSR still has `?preview=` but the client URL does not.
 */
export function shadowModeHref(searchParams: URLSearchParams): string {
  const params = new URLSearchParams(searchParams.toString());
  params.delete("mode");
  params.delete("preview");
  const view = parseView(params.get("view"));
  params.set("view", view);
  const qs = params.toString();
  return qs ? `/?${qs}` : "/?view=insights";
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
  extras?: {
    scoreFrom?: string | null;
    preview?: string | null;
    replaced?: boolean;
  }
): string {
  if (action.id === "acted") {
    return viewHref("insights", {
      scoreFrom: extras?.scoreFrom,
      status: "followup",
      preview: extras?.preview,
      replaced: replacedQueryValue(extras?.replaced),
    });
  }
  return viewHref(cadenceActionView(action), { scoreFrom: extras?.scoreFrom });
}

/**
 * Next needs-review id after `currentId` (no wrap; last → null).
 * Follow-up / Done origin is not in pending — return the first pending so
 * Mark as Acted can open the next review instead of an empty queue.
 */
export function nextPendingPreviewId(
  pending: { id: string }[],
  currentId: string,
): string | null {
  if (pending.length === 0) return null;
  const start = pending.findIndex((s) => s.id === currentId);
  if (start < 0) return pending[0]?.id ?? null;
  return pending[start + 1]?.id ?? null;
}

/** Previous needs-review id before `currentId` (no wrap; first → null). */
export function prevPendingPreviewId(
  pending: { id: string }[],
  currentId: string,
): string | null {
  const start = pending.findIndex((s) => s.id === currentId);
  if (start <= 0) return null;
  return pending[start - 1]?.id ?? null;
}

/**
 * Skip target: next needs-review after `currentId` (no wrap; last → null → list).
 * Follow-up / Done / Acted origin is not in pending — first pending so Skip
 * keeps walking the queue instead of jumping to the empty list.
 */
export function skipPendingPreviewId(
  pending: { id: string }[],
  currentId: string,
): string | null {
  if (pending.length === 0) return null;
  const start = pending.findIndex((s) => s.id === currentId);
  if (start < 0) return pending[0]?.id ?? null;
  return pending[start + 1]?.id ?? null;
}

/**
 * Open-review Prev / Next / Skip href. Keeps status, type, scoreFrom, and mode.
 * `previewId` null → filtered list (no `preview=`).
 */
export function pendingReviewWalkHref(opts: {
  previewId?: string | null;
  statusFilter?: StatusFilter | null;
  typeFilter?: TypeFilter | null;
  actionFilter?: ActionFilter | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
  replaced?: boolean;
  file?: string | null;
  /** Keep `?call=today` so Prev / Next / Skip stay on the Top 10 list. */
  callToday?: boolean;
}): string {
  const mode = opts.mode ?? "shadow";
  const status = opts.statusFilter ?? "all";
  const type = opts.typeFilter ?? "all";
  const action = opts.actionFilter ?? "all";
  return viewHref("insights", {
    scoreFrom: opts.scoreFrom,
    mode: mode === "action" ? "action" : null,
    status: statusQueryValue(status, mode),
    type: type === "all" ? null : type,
    action: action === "all" ? null : action,
    preview: opts.previewId,
    replaced: replacedQueryValue(opts.replaced),
    file: opts.file,
    call: opts.callToday ? "today" : null,
  });
}

/** Insights pending queue deep-link after feedback or Mark Acted. */
function pendingReviewQueueHref(opts: {
  nextPreviewId?: string | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
  replaced?: boolean;
  typeFilter?: TypeFilter | null;
  actionFilter?: ActionFilter | null;
  file?: string | null;
}): string {
  const modeExtra =
    opts.mode === "action" ? ({ mode: "action" } as const) : {};
  const replaced = replacedQueryValue(opts.replaced);
  const type = opts.typeFilter ?? "all";
  const action = opts.actionFilter ?? "all";
  return viewHref("insights", {
    ...modeExtra,
    scoreFrom: opts.scoreFrom,
    status: "new",
    type: type === "all" ? null : type,
    action: action === "all" ? null : action,
    preview: opts.nextPreviewId || null,
    replaced,
    file: opts.file,
  });
}

/**
 * After SignalScore feedback on a pending review.
 * Correct while pending remains → next Pending card.
 * Correct on the last pending → Follow-up list (`status=followup`, no preview).
 * Mark as Acted stays a second pass on that list.
 * Incorrect / Partially Correct → next needs-review panel, or Pending list.
 * Null when the reviewer should stay (re-edit, Follow-up / Done origin).
 */
export function afterFeedbackHref(opts: {
  wasPending: boolean;
  /** Feedback label just saved. */
  label?: FeedbackLabel | null;
  /** Current pending signal id — unused for routing. */
  currentSignalId?: string | null;
  nextPendingPreviewId?: string | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
  replaced?: boolean;
  typeFilter?: TypeFilter | null;
  actionFilter?: ActionFilter | null;
  file?: string | null;
}): string | null {
  if (!opts.wasPending) return null;
  const modeExtra =
    opts.mode === "action" ? ({ mode: "action" } as const) : {};
  const type = opts.typeFilter ?? "all";
  const action = opts.actionFilter ?? "all";
  if (opts.label === "correct") {
    if (opts.nextPendingPreviewId) {
      return pendingReviewQueueHref({
        nextPreviewId: opts.nextPendingPreviewId,
        scoreFrom: opts.scoreFrom,
        mode: opts.mode,
        replaced: opts.replaced,
        typeFilter: opts.typeFilter,
        actionFilter: opts.actionFilter,
        file: opts.file,
      });
    }
    return viewHref("insights", {
      ...modeExtra,
      scoreFrom: opts.scoreFrom,
      status: "followup",
      type: type === "all" ? null : type,
      action: action === "all" ? null : action,
      replaced: replacedQueryValue(opts.replaced),
      file: opts.file,
    });
  }
  return pendingReviewQueueHref({
    nextPreviewId: opts.nextPendingPreviewId,
    scoreFrom: opts.scoreFrom,
    mode: opts.mode,
    replaced: opts.replaced,
    typeFilter: opts.typeFilter,
    actionFilter: opts.actionFilter,
    file: opts.file,
  });
}

/**
 * After Mark as Acted on a Correct review.
 * Next Correct-not-Acted panel, else next pending review.
 * Null → stay on this panel (now Acted). Never the empty Insights list
 * ("No Signals Need Review").
 */
export function afterMarkActedHref(opts: {
  acted: boolean;
  feedbackLabel?: string | null;
  nextPreviewId?: string | null;
  nextPendingPreviewId?: string | null;
  /** Origin filter — unused for routing; empty lists are never a destination. */
  statusFilter?: StatusFilter | null;
  scoreFrom?: string | null;
  mode?: WorkspaceMode | null;
  replaced?: boolean;
  typeFilter?: TypeFilter | null;
  actionFilter?: ActionFilter | null;
  file?: string | null;
}): string | null {
  if (!opts.acted || opts.feedbackLabel !== "correct") return null;
  const modeExtra =
    opts.mode === "action" ? ({ mode: "action" } as const) : {};
  const type = opts.typeFilter ?? "all";
  const action = opts.actionFilter ?? "all";
  if (opts.nextPreviewId) {
    return viewHref("insights", {
      ...modeExtra,
      scoreFrom: opts.scoreFrom,
      status: "followup",
      type: type === "all" ? null : type,
      action: action === "all" ? null : action,
      preview: opts.nextPreviewId,
      replaced: replacedQueryValue(opts.replaced),
      file: opts.file,
    });
  }
  if (opts.nextPendingPreviewId) {
    return pendingReviewQueueHref({
      nextPreviewId: opts.nextPendingPreviewId,
      scoreFrom: opts.scoreFrom,
      mode: opts.mode,
      replaced: opts.replaced,
      typeFilter: opts.typeFilter,
      actionFilter: opts.actionFilter,
      file: opts.file,
    });
  }
  return null;
}
