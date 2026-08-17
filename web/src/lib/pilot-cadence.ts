/**
 * Week-1 Shadow Mode pilot cadence — display-only checklist state.
 * FastAPI/Neon remains SoT for reviews; JSON holds chats + pilot baseline.
 * After go/no-go, the next action is next week’s mid-week upsert — not a dead end.
 */

export const PILOT_MIN_REVIEWS = 5;

export type PilotCadenceSurface = "insights" | "upload" | "eval";

export type PilotCadenceStepId =
  | "day1"
  | "midweek"
  | "reviews"
  | "baseline"
  | "gonogo";

/** Incomplete checklist step, or next week after share-out. */
export type PilotCadenceActionId = PilotCadenceStepId | "nextweek";

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

const NEXT_WEEK_ACTION: PilotCadenceAction = {
  id: "nextweek",
  label: "Next week — re-upload weekly export",
};

/** Incomplete step, or next week’s upsert once go/no-go is shareable. */
export function nextPilotCadenceAction(
  steps: PilotCadenceStep[]
): PilotCadenceAction {
  return nextPilotCadenceStep(steps) ?? NEXT_WEEK_ACTION;
}

export function cadenceActionView(
  action: PilotCadenceAction
): PilotCadenceSurface {
  switch (action.id) {
    case "reviews":
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
