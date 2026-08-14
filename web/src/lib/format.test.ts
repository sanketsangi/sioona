import { describe, expect, it } from "vitest";
import {
  customerNameFromExternalId,
  initialsFromName,
  isSignalNeedsReview,
  queueSignalSummary,
  scoreIconClass,
  scoreIconColor,
  scoreIconKind,
  signalReviewStatusLabel,
  signalStatusDot,
  stripSummaryEvidenceQuote,
} from "./format";

describe("scoreIconKind", () => {
  it("maps stop / warning / good bands", () => {
    expect(scoreIconKind(0.49)).toBe("stop");
    expect(scoreIconKind(0.5)).toBe("warning");
    expect(scoreIconKind(0.9)).toBe("warning");
    expect(scoreIconKind(0.91)).toBe("good");
    expect(scoreIconKind(1)).toBe("good");
  });

  it("pairs exact hex colors for mask currentColor", () => {
    expect(scoreIconColor(0.91)).toBe("#279141");
    expect(scoreIconColor(0.5)).toBe("#ff9300");
    expect(scoreIconColor(0.49)).toBe("#d8001b");
  });

  it("mirrors hex as Tailwind text classes", () => {
    expect(scoreIconClass(0.91)).toBe("text-[#279141]");
    expect(scoreIconClass(0.5)).toBe("text-[#ff9300]");
    expect(scoreIconClass(0.49)).toBe("text-[#d8001b]");
  });
});

describe("signalReviewStatusLabel", () => {
  it("labels unreviewed as Pending", () => {
    expect(
      signalReviewStatusLabel({
        status: "new",
      })
    ).toBe("Pending");
    expect(
      isSignalNeedsReview({ status: "new", feedback: undefined })
    ).toBe(true);
  });

  it("labels feedback outcomes without Reviewed prefix", () => {
    expect(
      signalReviewStatusLabel({
        status: "reviewed",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toBe("Correct");
    expect(
      signalReviewStatusLabel({
        status: "reviewed",
        feedback: { label: "incorrect", reviewedAt: "2026-01-01" },
      })
    ).toBe("Incorrect");
    expect(
      signalReviewStatusLabel({
        status: "reviewed",
        feedback: { label: "partially_correct", reviewedAt: "2026-01-01" },
      })
    ).toBe("Partially Correct");
  });

  it("labels acted over feedback", () => {
    expect(
      signalReviewStatusLabel({
        status: "acted",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toBe("Acted");
    expect(
      isSignalNeedsReview({
        status: "acted",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toBe(false);
  });
});

describe("signalStatusDot", () => {
  it("maps needs-review to QUEUED", () => {
    expect(signalStatusDot({ status: "new" })).toEqual({
      state: "QUEUED",
      label: "Pending",
    });
  });

  it("prefers feedback over stale status===new", () => {
    expect(
      isSignalNeedsReview({
        status: "new",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toBe(false);
    expect(
      signalStatusDot({
        status: "new",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toEqual({ state: "READY", label: "Correct" });
  });

  it("maps feedback labels to geistcn-inspired states", () => {
    expect(
      signalStatusDot({
        status: "reviewed",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toEqual({ state: "READY", label: "Correct" });
    expect(
      signalStatusDot({
        status: "reviewed",
        feedback: { label: "incorrect", reviewedAt: "2026-01-01" },
      })
    ).toEqual({ state: "ERROR", label: "Incorrect" });
    expect(
      signalStatusDot({
        status: "reviewed",
        feedback: { label: "partially_correct", reviewedAt: "2026-01-01" },
      })
    ).toEqual({ state: "BUILDING", label: "Partially Correct" });
  });

  it("maps acted to CANCELED / Acted", () => {
    expect(
      signalStatusDot({
        status: "acted",
        feedback: { label: "correct", reviewedAt: "2026-01-01" },
      })
    ).toEqual({ state: "CANCELED", label: "Acted" });
  });
});

describe("customerNameFromExternalId", () => {
  it("title-cases name tokens before a numeric suffix", () => {
    expect(customerNameFromExternalId("rahul_mehta_29")).toBe("Rahul Mehta");
    expect(customerNameFromExternalId("priya_sharma_22")).toBe("Priya Sharma");
  });

  it("returns null for non-corpus ids", () => {
    expect(customerNameFromExternalId("wa-1001")).toBeNull();
    expect(customerNameFromExternalId("")).toBeNull();
    expect(customerNameFromExternalId(null)).toBeNull();
  });
});

describe("initialsFromName", () => {
  it("takes first + last initials for multi-word names", () => {
    expect(initialsFromName("Neha Singh")).toBe("NS");
    expect(initialsFromName("Asha Mehta")).toBe("AM");
  });

  it("uses a single letter for one-word names", () => {
    expect(initialsFromName("Neha")).toBe("N");
  });

  it("ignores punctuation and extra whitespace", () => {
    expect(initialsFromName("  Neha-Singh  ")).toBe("NS");
    expect(initialsFromName("O'Brien")).toBe("OB");
  });

  it("returns ? for missing or empty names", () => {
    expect(initialsFromName()).toBe("?");
    expect(initialsFromName("")).toBe("?");
    expect(initialsFromName("   ")).toBe("?");
    expect(initialsFromName("!!!")).toBe("?");
  });
});

describe("stripSummaryEvidenceQuote", () => {
  it("removes a trailing curly-quoted evidence suffix", () => {
    expect(
      stripSummaryEvidenceQuote(
        'Shalini Pandey (upload) may be drifting — check in before they leave. “I just saw an email…”'
      )
    ).toBe(
      "Shalini Pandey (upload) may be drifting — check in before they leave."
    );
  });

  it("leaves narrative-only summaries unchanged", () => {
    expect(
      stripSummaryEvidenceQuote(
        "Shalini Pandey (upload) may be drifting — check in before they leave."
      )
    ).toBe(
      "Shalini Pandey (upload) may be drifting — check in before they leave."
    );
  });
});

describe("queueSignalSummary", () => {
  it("strips name + optional channel and capitalizes the rest", () => {
    expect(
      queueSignalSummary(
        "Shalini Pandey (upload) may be drifting…",
        "Shalini Pandey"
      )
    ).toBe("May be drifting…");
  });

  it("strips name-only prefix", () => {
    expect(
      queueSignalSummary("Shalini Pandey may be drifting…", "Shalini Pandey")
    ).toBe("May be drifting…");
  });

  it("strips legacy quoteHint after name/channel", () => {
    expect(
      queueSignalSummary(
        'Shalini Pandey (upload) may be drifting — check in before they leave. “I just saw an email…”',
        "Shalini Pandey"
      )
    ).toBe("May be drifting — check in before they leave.");
  });

  it("leaves summaries without a name prefix unchanged", () => {
    expect(
      queueSignalSummary("Renewal risk in Q3 pipeline", "Shalini Pandey")
    ).toBe("Renewal risk in Q3 pipeline");
  });

  it("falls back to the original when strip would empty", () => {
    expect(queueSignalSummary("Shalini Pandey", "Shalini Pandey")).toBe(
      "Shalini Pandey"
    );
    expect(
      queueSignalSummary("Shalini Pandey (upload)", "Shalini Pandey")
    ).toBe("Shalini Pandey (upload)");
  });
});
