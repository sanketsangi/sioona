import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FEEDBACK_SAVED_EVENT,
  clearRecentFeedbackSaved,
  emitFeedbackSaved,
  hasRecentFeedbackSaved,
} from "./feedback-saved";

afterEach(() => {
  clearRecentFeedbackSaved("sig_a");
  clearRecentFeedbackSaved("sig_b");
  vi.unstubAllGlobals();
});

describe("feedback-saved notice", () => {
  it("records ids in-memory even without window (SSR / Node tests)", () => {
    expect(typeof window).toBe("undefined");
    emitFeedbackSaved("sig_a");
    expect(hasRecentFeedbackSaved("sig_a")).toBe(true);
    expect(hasRecentFeedbackSaved("sig_b")).toBe(false);
    clearRecentFeedbackSaved("sig_a");
    expect(hasRecentFeedbackSaved("sig_a")).toBe(false);
  });

  it("dispatches a CustomEvent when window exists", () => {
    const dispatchEvent = vi.fn();
    vi.stubGlobal("window", { dispatchEvent });

    emitFeedbackSaved("sig_a");
    expect(hasRecentFeedbackSaved("sig_a")).toBe(true);
    expect(dispatchEvent).toHaveBeenCalledTimes(1);
    const event = dispatchEvent.mock.calls[0]?.[0] as CustomEvent<{
      signalId: string;
    }>;
    expect(event.type).toBe(FEEDBACK_SAVED_EVENT);
    expect(event.detail).toEqual({ signalId: "sig_a" });
  });
});
