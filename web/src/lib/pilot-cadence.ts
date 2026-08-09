/**
 * Week-1 Shadow Mode pilot cadence — display-only checklist state.
 * FastAPI/Neon remains SoT for reviews; JSON holds chats + pilot baseline.
 */

export const PILOT_MIN_REVIEWS = 5;

export type PilotCadenceSurface = "insights" | "upload" | "eval";

export type PilotCadenceStepId =
  | "day1"
  | "midweek"
  | "reviews"
  | "baseline"
  | "gonogo";

export interface PilotCadenceStep {
  id: PilotCadenceStepId;
  label: string;
  done: boolean;
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
