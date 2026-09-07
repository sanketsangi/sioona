import { describe, expect, it } from "vitest";
import {
  clearRecentFeedbackSaved,
  emitFeedbackSaved,
  recentFeedbackLabel,
} from "./feedback-saved";
import { resolveCanMarkActed } from "./use-mark-acted";

describe("resolveCanMarkActed (Correct-before-Acted)", () => {
  it("requires Correct feedback and unlocks only when not already Acted", () => {
    expect(
      resolveCanMarkActed({
        hasFeedback: true,
        feedbackLabel: "correct",
        isActed: false,
      }),
    ).toBe(true);
    expect(
      resolveCanMarkActed({
        hasFeedback: true,
        feedbackLabel: "correct",
        isActed: true,
      }),
    ).toBe(false);
  });

  it("does not unlock for Incorrect, Partial, or missing feedback", () => {
    expect(
      resolveCanMarkActed({
        hasFeedback: false,
        feedbackLabel: null,
        isActed: false,
      }),
    ).toBe(false);
    expect(
      resolveCanMarkActed({
        hasFeedback: true,
        feedbackLabel: "incorrect",
        isActed: false,
      }),
    ).toBe(false);
    expect(
      resolveCanMarkActed({
        hasFeedback: true,
        feedbackLabel: "partially_correct",
        isActed: false,
      }),
    ).toBe(false);
  });

  it("optimistic FEEDBACK_SAVED label unlocks only for Correct", () => {
    emitFeedbackSaved("sig_opt", "incorrect");
    const incorrect = recentFeedbackLabel("sig_opt");
    expect(
      resolveCanMarkActed({
        hasFeedback: incorrect != null,
        feedbackLabel: incorrect,
        isActed: false,
      }),
    ).toBe(false);

    emitFeedbackSaved("sig_opt", "correct");
    const correct = recentFeedbackLabel("sig_opt");
    expect(
      resolveCanMarkActed({
        hasFeedback: correct != null,
        feedbackLabel: correct,
        isActed: false,
      }),
    ).toBe(true);

    clearRecentFeedbackSaved("sig_opt");
  });
});
