import { describe, expect, it } from "vitest";
import {
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
