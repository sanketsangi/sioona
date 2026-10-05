import { describe, expect, it } from "vitest";
import {
  inspectSignalScoreWindow,
  resolveSignalScoreDateFrom,
  SIGNAL_SCORE_WINDOW_DAYS,
} from "./signal-score-window";

describe("resolveSignalScoreDateFrom", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it(`defaults to now minus ${SIGNAL_SCORE_WINDOW_DAYS} days UTC`, () => {
    const from = resolveSignalScoreDateFrom({ now });
    expect(from).toBe("2026-08-07T12:00:00.000Z");
  });

  it("prefers scoreFrom query over env and default", () => {
    const from = resolveSignalScoreDateFrom({
      scoreFrom: "2026-08-01",
      envFrom: "2026-07-01",
      now,
    });
    expect(from).toBe("2026-08-01T00:00:00.000Z");
  });

  it("uses SIGNAL_SCORE_FROM env when scoreFrom is absent", () => {
    const from = resolveSignalScoreDateFrom({
      envFrom: "2026-08-05T08:30:00.000Z",
      now,
    });
    expect(from).toBe("2026-08-05T08:30:00.000Z");
  });

  it("falls back to default when scoreFrom is invalid", () => {
    const from = resolveSignalScoreDateFrom({
      scoreFrom: "not-a-date",
      now,
    });
    expect(from).toBe("2026-08-07T12:00:00.000Z");
  });
});

describe("inspectSignalScoreWindow", () => {
  const now = new Date("2026-08-14T12:00:00.000Z");

  it("labels the default last-7-days window", () => {
    const window = inspectSignalScoreWindow({ now });
    expect(window.status).toBe("default");
    expect(window.label).toBe("Last 7 days");
    expect(window.dateInput).toBe("2026-08-07");
    expect(window.resolvedFrom).toBe("2026-08-07T12:00:00.000Z");
  });

  it("labels a custom scoreFrom date", () => {
    const window = inspectSignalScoreWindow({
      scoreFrom: "2026-08-20",
      now,
    });
    expect(window.status).toBe("custom");
    expect(window.label).toBe("From 20 Aug 2026");
    expect(window.dateInput).toBe("2026-08-20");
    expect(window.resolvedFrom).toBe("2026-08-20T00:00:00.000Z");
  });

  it("marks invalid scoreFrom and falls back to last 7 days", () => {
    const window = inspectSignalScoreWindow({
      scoreFrom: "not-a-date",
      now,
    });
    expect(window.status).toBe("invalid");
    expect(window.label).toBe("Last 7 days");
    expect(window.resolvedFrom).toBe("2026-08-07T12:00:00.000Z");
  });
});

it("labels an environment override with its actual date", () => {
  const window = inspectSignalScoreWindow({ envFrom: "2026-01-01", now: new Date("2026-10-04") });
  expect(window.label).toBe("From 1 Jan 2026");
  expect(window.status).toBe("custom");
});

it("validates inclusive end dates and reversed windows", async () => {
  const { inspectSignalScoreEnd } = await import("./signal-score-window");
  expect(inspectSignalScoreEnd("2026-10-04", "2026-10-01T00:00:00Z")).toEqual({ dateTo: "2026-10-04T23:59:59.999Z" });
  expect(inspectSignalScoreEnd("2026-02-30", "2026-01-01").error).toBeTruthy();
  expect(inspectSignalScoreEnd("2026-09-30", "2026-10-01").error).toBeTruthy();
});
