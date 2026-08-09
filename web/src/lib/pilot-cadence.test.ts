import { describe, expect, it } from "vitest";
import {
  computePilotCadenceSteps,
  hasMidWeekExport,
  hasPilotBaseline,
  nextPilotCadenceStep,
  PILOT_MIN_REVIEWS,
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
