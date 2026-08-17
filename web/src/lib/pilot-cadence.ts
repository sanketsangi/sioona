/**
 * Week-1 Shadow Mode pilot cadence — display-only checklist state.
 * FastAPI/Neon remains SoT for reviews; JSON holds chats + pilot baseline.
 * After go/no-go: Mark Acted on Correct reviews (display-only), then next week’s upsert.
 */

export const PILOT_MIN_REVIEWS = 5;

export type PilotCadenceSurface = "insights" | "upload" | "eval";

export type PilotCadenceStepId =
  | "day1"
  | "midweek"
  | "reviews"
  | "baseline"
  | "gonogo";

/** Incomplete checklist step, Acted follow-up after go, or next week. */
export type PilotCadenceActionId = PilotCadenceStepId | "acted" | "nextweek";

export interface PilotCadenceStep {
  id: PilotCadenceStepId;
  label: string;
  done: boolean;
}

export interface PilotCadenceAction {
  id: PilotCadenceActionId;
  label: string;
}

export interface PilotCadenceInput {
  hasDay1: boolean;
  hasMidWeekUpload: boolean;
  reviewedCount: number;
  hasBaseline: boolean;
  /** Enough human reviews to share a go/no-go call. */
  goNoGoReady?: boolean;
  minReviews?: number;
}

export function computePilotCadenceSteps(
  input: PilotCadenceInput
): PilotCadenceStep[] {
  const minReviews = input.minReviews ?? PILOT_MIN_REVIEWS;
  const reviewsDone = input.reviewedCount >= minReviews;
  // Share-out is last: need ≥N reviews and a baseline so lift/go-no-go is credible.
  const goNoGoReady =
    input.goNoGoReady ?? (reviewsDone && input.hasBaseline);

  return [
    {
      id: "day1",
      label: "Day 1 — Upload or Partner Demo",
      done: input.hasDay1,
    },
    {
      id: "midweek",
      label: "Mid-week — Re-upload weekly export",
      done: input.hasMidWeekUpload,
    },
    {
      id: "reviews",
      label: `Mark ≥${minReviews} SignalScore reviews`,
      done: reviewsDone,
    },
    {
      id: "baseline",
      label: "Set baseline on Eval",
      done: input.hasBaseline,
    },
    {
      id: "gonogo",
      label: "Share go/no-go",
      done: goNoGoReady,
    },
  ];
}

/** Next incomplete step — drives surface-specific helper copy. */
export function nextPilotCadenceStep(
  steps: PilotCadenceStep[]
): PilotCadenceStep | null {
  return steps.find((s) => !s.done) ?? null;
}

const ACTED_ACTION: PilotCadenceAction = {
  id: "acted",
  label: "Mark Acted on Correct reviews",
};

const NEXT_WEEK_ACTION: PilotCadenceAction = {
  id: "nextweek",
  label: "Next week — re-upload weekly export",
};

export interface NextCadenceActionOpts {
  /** Correct reviews not yet Mark Acted (Shadow Mode; no outbound). */
  unactedCorrectCount?: number;
}

/**
 * Incomplete step; else Mark Acted on remaining Correct; else next week’s upsert.
 */
export function nextPilotCadenceAction(
  steps: PilotCadenceStep[],
  opts?: NextCadenceActionOpts
): PilotCadenceAction {
  const next = nextPilotCadenceStep(steps);
  if (next) return next;
  if ((opts?.unactedCorrectCount ?? 0) > 0) return ACTED_ACTION;
  return NEXT_WEEK_ACTION;
}

export function cadenceActionView(
  action: PilotCadenceAction
): PilotCadenceSurface {
  switch (action.id) {
    case "reviews":
    case "acted":
      return "insights";
    case "baseline":
    case "gonogo":
      return "eval";
    case "day1":
    case "midweek":
    case "nextweek":
      return "upload";
  }
}

export function cadenceActionCta(action: PilotCadenceAction): string {
  switch (action.id) {
    case "day1":
      return "Upload or Partner Demo";
    case "midweek":
    case "nextweek":
      return "Upload Weekly Export";
    case "reviews":
      return "Open Insights";
    case "acted":
      return "Mark as Acted";
    case "baseline":
      return "Set Baseline";
    case "gonogo":
      return "Open Eval";
  }
}

/** Quiet one-line helper for Insights / Upload / Eval — no new chrome. */
export function pilotCadenceHelperCopy(
  surface: PilotCadenceSurface,
  action: PilotCadenceAction
): string {
  if (action.id === "acted") {
    switch (surface) {
      case "insights":
        return "Correct reviews still need Mark Acted (does not send the suggested action).";
      case "upload":
        return "Mark Acted on Correct reviews in Insights first (does not send), then re-upload next week.";
      case "eval":
        return "Then Mark Acted on Correct reviews in Insights (does not send).";
    }
  }

  if (action.id === "nextweek") {
    switch (surface) {
      case "insights":
        return "Queue is clear for this window. Share go/no-go on Eval, or re-upload next week’s export (upsert, not replace).";
      case "upload":
        return "This week’s keep-set is closed. Re-upload the weekly export — matching chats upsert, not a Day-1 replace.";
      case "eval":
        return "Then re-upload next week’s export (upsert, not replace).";
    }
  }

  switch (action.id) {
    case "day1":
      return surface === "upload"
        ? "Day 1 — upload a partner export or run Partner Demo."
        : "Start with Upload or Partner Demo.";
    case "midweek":
      return "Mid-week — re-upload the weekly export (upsert by external id).";
    case "reviews":
      return `Mark ≥${PILOT_MIN_REVIEWS} SignalScore reviews in Insights.`;
    case "baseline":
      return "Set the partner baseline on Eval so lift is credible.";
    case "gonogo":
      return "Open Eval to share this window’s go/no-go.";
  }
}

function isUnactedCorrect(signal: {
  status: string;
  feedback?: { label: string } | null;
}): boolean {
  return signal.feedback?.label === "correct" && signal.status !== "acted";
}

/** Correct reviews not yet Mark Acted (Shadow Mode display-only). */
export function countUnactedCorrect(
  signals: Array<{ status: string; feedback?: { label: string } | null }>
): number {
  return signals.filter(isUnactedCorrect).length;
}

/** First Correct-not-Acted id for cadence `?preview=` deep links. */
export function firstUnactedCorrectId(
  signals: Array<{
    id: string;
    status: string;
    feedback?: { label: string } | null;
  }>
): string | null {
  return signals.find(isUnactedCorrect)?.id ?? null;
}

export function hasPilotBaseline(
  baselineOpportunities: number,
  baselineNote?: string | null
): boolean {
  return baselineOpportunities > 0 || Boolean(baselineNote?.trim());
}

/** Mid-week step: ≥1 partner file ingest (cold demo does not increment). */
export function hasMidWeekExport(weeklyExportCount?: number | null): boolean {
  return (weeklyExportCount ?? 0) >= 1;
}
