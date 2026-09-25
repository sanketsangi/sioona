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
      label: `Mark ≥${minReviews} Corrects this window`,
      done: reviewsDone,
    },
    {
      id: "baseline",
      label: "Set baseline on Eval",
      done: input.hasBaseline,
    },
    {
      id: "gonogo",
      label: "Share ≥80% Go on Eval",
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
        return "Mark the correct ones as Acted. You run the follow-up in your own tools. Nothing is sent.";
      case "upload":
        return "Mark the correct reviews as Acted in Insights first. Nothing is sent. Then upload next week’s export.";
      case "eval":
        return "Then mark the correct reviews as Acted in Insights. Nothing is sent.";
    }
  }

  if (action.id === "nextweek") {
    switch (surface) {
      case "insights":
        return "This week’s reviews are done. Open Eval for the weekly score, or upload next week’s export.";
      case "upload":
        return "Upload next week’s export. Matching chats update. This does not start over.";
      case "eval":
        return "Then upload next week’s export.";
    }
  }

  switch (action.id) {
    case "day1":
      return "Upload this week’s export to start. Nothing is sent.";
    case "midweek":
      return "Upload this week’s export. Matching chats update.";
    case "reviews":
      return `Review ${PILOT_MIN_REVIEWS} chats this week. Mark the ones we got right. The weekly score is on Eval, and nothing is sent.`;
    case "baseline":
      return "On Eval, set how many opportunities you find today so the lift is clear.";
    case "gonogo":
      return "Open Eval for this week’s score. Go is at least 80%. Nothing is sent.";
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

type UnactedCorrectSignal = {
  id: string;
  status: string;
  feedback?: { label: string } | null;
};

/** First Correct-not-Acted id for cadence `?preview=` deep links. */
export function firstUnactedCorrectId(
  signals: Array<UnactedCorrectSignal>
): string | null {
  return signals.find(isUnactedCorrect)?.id ?? null;
}

/**
 * Next Correct-not-Acted after `currentId` (wraps). Used after Mark as Acted.
 * Excludes current even if it is still unacted (caller has just persisted Acted).
 */
export function nextUnactedCorrectId(
  signals: Array<UnactedCorrectSignal>,
  currentId: string
): string | null {
  const n = signals.length;
  if (n === 0) return null;
  const start = signals.findIndex((s) => s.id === currentId);
  const from = start >= 0 ? start : 0;
  for (let i = 1; i <= n; i++) {
    const signal = signals[(from + i) % n];
    if (signal.id !== currentId && isUnactedCorrect(signal)) {
      return signal.id;
    }
  }
  return null;
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
