import { describe, expect, it } from "vitest";
import {
  cadenceActionCta,
  cadenceActionView,
  computePilotCadenceSteps,
  countUnactedCorrect,
  firstUnactedCorrectId,
  hasMidWeekExport,
  hasPilotBaseline,
  nextPilotCadenceAction,
  nextPilotCadenceStep,
  nextUnactedCorrectId,
  PILOT_MIN_REVIEWS,
  pilotCadenceHelperCopy,
} from "./pilot-cadence";

describe("computePilotCadenceSteps", () => {
  it("marks nothing done on a cold start", () => {
    const steps = computePilotCadenceSteps({
      hasDay1: false,
      hasMidWeekUpload: false,
      reviewedCount: 0,
      hasBaseline: false,
    });
    expect(steps.every((s) => !s.done)).toBe(true);
    expect(nextPilotCadenceStep(steps)?.id).toBe("day1");
  });

  it("progresses Day 1 → mid-week → reviews → baseline → go/no-go", () => {
    const afterDay1 = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: false,
      reviewedCount: 0,
      hasBaseline: false,
    });
    expect(afterDay1.find((s) => s.id === "day1")?.done).toBe(true);
    expect(nextPilotCadenceStep(afterDay1)?.id).toBe("midweek");

    const afterMidweek = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: 3,
      hasBaseline: false,
    });
    expect(afterMidweek.find((s) => s.id === "midweek")?.done).toBe(true);
    expect(nextPilotCadenceStep(afterMidweek)?.id).toBe("reviews");

    const afterReviews = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: PILOT_MIN_REVIEWS,
      hasBaseline: false,
    });
    expect(afterReviews.find((s) => s.id === "reviews")?.done).toBe(true);
    expect(afterReviews.find((s) => s.id === "gonogo")?.done).toBe(false);
    expect(nextPilotCadenceStep(afterReviews)?.id).toBe("baseline");

    const afterBaseline = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: PILOT_MIN_REVIEWS,
      hasBaseline: true,
    });
    expect(afterBaseline.every((s) => s.done)).toBe(true);
    expect(nextPilotCadenceStep(afterBaseline)).toBeNull();
    expect(nextPilotCadenceAction(afterBaseline)).toEqual({
      id: "nextweek",
      label: "Next week — re-upload weekly export",
    });
    expect(
      nextPilotCadenceAction(afterBaseline, { unactedCorrectCount: 3 }).id
    ).toBe("acted");
  });

  it("does not mark go/no-go before reviews and baseline", () => {
    expect(
      computePilotCadenceSteps({
        hasDay1: true,
        hasMidWeekUpload: true,
        reviewedCount: 4,
        hasBaseline: true,
      }).find((s) => s.id === "gonogo")?.done
    ).toBe(false);
    expect(
      computePilotCadenceSteps({
        hasDay1: true,
        hasMidWeekUpload: true,
        reviewedCount: PILOT_MIN_REVIEWS,
        hasBaseline: false,
      }).find((s) => s.id === "gonogo")?.done
    ).toBe(false);
  });
});

describe("pilot cadence win copy", () => {
  it("labels the reviews step as ≥N Corrects, not reviews alone", () => {
    const steps = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: 2,
      hasBaseline: false,
    });
    const reviews = steps.find((s) => s.id === "reviews");
    expect(reviews?.label).toMatch(/Corrects this window/);
    expect(reviews?.label).not.toMatch(/SignalScore reviews/);
    expect(steps.find((s) => s.id === "gonogo")?.label).toMatch(/≥80% Go/);
  });

  it("helper copy states Corrects + ≥80% Go", () => {
    const reviewsAction = {
      id: "reviews" as const,
      label: "Mark ≥5 Corrects this window",
    };
    const goAction = {
      id: "gonogo" as const,
      label: "Share ≥80% Go on Eval",
    };
    expect(pilotCadenceHelperCopy("insights", reviewsAction)).toMatch(
      /Corrects this window/
    );
    expect(pilotCadenceHelperCopy("insights", reviewsAction)).toMatch(/≥80%/);
    expect(pilotCadenceHelperCopy("eval", goAction)).toMatch(/≥80%/);
    expect(pilotCadenceHelperCopy("eval", goAction)).toMatch(/Go/);
  });
});

describe("nextPilotCadenceAction", () => {
  it("points incomplete checklists at the first open step", () => {
    const steps = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: 2,
      hasBaseline: true,
    });
    expect(nextPilotCadenceAction(steps).id).toBe("reviews");
    expect(cadenceActionView(nextPilotCadenceAction(steps))).toBe("insights");
    expect(cadenceActionCta(nextPilotCadenceAction(steps))).toBe("Open Insights");
  });

  it("after go/no-go, Mark Acted on remaining Correct before next-week upsert", () => {
    const steps = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: PILOT_MIN_REVIEWS,
      hasBaseline: true,
    });
    const acted = nextPilotCadenceAction(steps, { unactedCorrectCount: 2 });
    expect(acted.id).toBe("acted");
    expect(cadenceActionView(acted)).toBe("insights");
    expect(cadenceActionCta(acted)).toBe("Mark as Acted");
    expect(pilotCadenceHelperCopy("insights", acted)).toMatch(/does not send/i);
    expect(pilotCadenceHelperCopy("eval", acted)).toMatch(/Mark Acted/);
  });

  it("after go/no-go, next action is next week’s upsert not a dead end", () => {
    const steps = computePilotCadenceSteps({
      hasDay1: true,
      hasMidWeekUpload: true,
      reviewedCount: PILOT_MIN_REVIEWS,
      hasBaseline: true,
    });
    const action = nextPilotCadenceAction(steps);
    expect(action.id).toBe("nextweek");
    expect(cadenceActionView(action)).toBe("upload");
    expect(cadenceActionCta(action)).toBe("Upload Weekly Export");
    expect(pilotCadenceHelperCopy("insights", action)).toMatch(/Eval/);
    expect(pilotCadenceHelperCopy("insights", action)).toMatch(/upsert/i);
    expect(pilotCadenceHelperCopy("upload", action)).toMatch(/replaced=false|upsert/i);
    expect(pilotCadenceHelperCopy("eval", action)).toMatch(/next week/i);
  });
});

describe("countUnactedCorrect", () => {
  it("counts Correct reviews that are not Acted", () => {
    expect(
      countUnactedCorrect([
        { status: "reviewed", feedback: { label: "correct" } },
        { status: "acted", feedback: { label: "correct" } },
        { status: "reviewed", feedback: { label: "incorrect" } },
        { status: "new" },
      ])
    ).toBe(1);
  });
});

describe("firstUnactedCorrectId", () => {
  it("returns the first Correct-not-Acted id", () => {
    expect(
      firstUnactedCorrectId([
        { id: "acted", status: "acted", feedback: { label: "correct" } },
        { id: "keep", status: "reviewed", feedback: { label: "correct" } },
        { id: "later", status: "reviewed", feedback: { label: "correct" } },
      ])
    ).toBe("keep");
    expect(
      firstUnactedCorrectId([
        { id: "acted", status: "acted", feedback: { label: "correct" } },
      ])
    ).toBeNull();
  });
});

describe("nextUnactedCorrectId", () => {
  const signals = [
    { id: "a", status: "reviewed", feedback: { label: "correct" } },
    { id: "skip", status: "reviewed", feedback: { label: "incorrect" } },
    { id: "b", status: "reviewed", feedback: { label: "correct" } },
    { id: "done", status: "acted", feedback: { label: "correct" } },
    { id: "c", status: "reviewed", feedback: { label: "correct" } },
  ];

  it("walks to the next Correct-not-Acted and wraps", () => {
    expect(nextUnactedCorrectId(signals, "a")).toBe("b");
    expect(nextUnactedCorrectId(signals, "b")).toBe("c");
    expect(nextUnactedCorrectId(signals, "c")).toBe("a");
  });

  it("returns null when no other Correct-not-Acted remains", () => {
    expect(
      nextUnactedCorrectId(
        [{ id: "only", status: "reviewed", feedback: { label: "correct" } }],
        "only"
      )
    ).toBeNull();
  });
});

describe("hasPilotBaseline", () => {
  it("accepts count or note", () => {
    expect(hasPilotBaseline(0, null)).toBe(false);
    expect(hasPilotBaseline(4, null)).toBe(true);
    expect(hasPilotBaseline(0, "Desk flags ~2/week")).toBe(true);
  });
});

describe("hasMidWeekExport", () => {
  it("requires at least one partner file ingest", () => {
    expect(hasMidWeekExport(undefined)).toBe(false);
    expect(hasMidWeekExport(0)).toBe(false);
    expect(hasMidWeekExport(1)).toBe(true);
  });
});
