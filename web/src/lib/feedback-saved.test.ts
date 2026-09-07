import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_SAVED_EVENT,
  clearRecentFeedbackSaved,
  emitFeedbackSaved,
  hasRecentFeedbackSaved,
  recentFeedbackLabel,
} from "./feedback-saved";

afterEach(() => {
  clearRecentFeedbackSaved("sig_a");
  clearRecentFeedbackSaved("sig_b");
  vi.unstubAllGlobals();
});

describe("feedback-saved notice", () => {
  it("records ids + labels in-memory even without window (SSR / Node tests)", () => {
    expect(typeof window).toBe("undefined");
    emitFeedbackSaved("sig_a", "correct");
    expect(hasRecentFeedbackSaved("sig_a")).toBe(true);
    expect(recentFeedbackLabel("sig_a")).toBe("correct");
    expect(hasRecentFeedbackSaved("sig_b")).toBe(false);
    expect(recentFeedbackLabel("sig_b")).toBeNull();
    clearRecentFeedbackSaved("sig_a");
    expect(hasRecentFeedbackSaved("sig_a")).toBe(false);
    expect(recentFeedbackLabel("sig_a")).toBeNull();
  });

  it("stores Incorrect / Partial without treating them as Correct", () => {
    emitFeedbackSaved("sig_a", "incorrect");
    expect(recentFeedbackLabel("sig_a")).toBe("incorrect");
    emitFeedbackSaved("sig_a", "partially_correct");
    expect(recentFeedbackLabel("sig_a")).toBe("partially_correct");
  });

  it("dispatches a CustomEvent with label when window exists", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    emitFeedbackSaved("sig_a", "correct");
    expect(hasRecentFeedbackSaved("sig_a")).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{
      signalId: string;
      label: string;
    }>;
    expect(event.type).toBe(FEEDBACK_SAVED_EVENT);
    expect(event.detail).toEqual({ signalId: "sig_a", label: "correct" });
  });
});
