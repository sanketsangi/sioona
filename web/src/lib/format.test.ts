import { describe, expect, it } from "vitest";
import {
  customerNameFromExternalId,
  initialsFromName,
  isSignalNeedsReview,
  signalReviewStatusLabel,
  signalStatusDot,
} from "./format";

describe("signalReviewStatusLabel", () => {
  it("labels unreviewed as Needs Review", () => {
    expect(
      signalReviewStatusLabel({
        status: "new",
      })
    ).toBe("Needs Review");
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
});

describe("signalStatusDot", () => {
  it("maps needs-review to QUEUED", () => {
    expect(signalStatusDot({ status: "new" })).toEqual({
      state: "QUEUED",
      label: "Needs Review",
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
