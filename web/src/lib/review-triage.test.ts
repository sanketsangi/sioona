import { describe, expect, it } from "vitest";
import {
  buildSignalReviewTriage,
  feedbackLabelForShortcutKey,
  isActedEnterBlockedTarget,
  isEditableShortcutTarget,
  isMarkActedShortcutKey,
} from "./review-triage";

describe("buildSignalReviewTriage", () => {
  const pending = [{ id: "sig_a" }, { id: "sig_b" }];

  it("marks preview as pending when it is in needs-review", () => {
    expect(
      buildSignalReviewTriage({
        pendingSignals: pending,
        previewSignal: { id: "sig_a" },
      }),
    ).toEqual({
      isPendingReview: true,
      nextPendingPreviewId: "sig_b",
      scoreFrom: undefined,
      mode: undefined,
    });
  });

  it("marks follow-up preview as not pending and points at first pending", () => {
    expect(
      buildSignalReviewTriage({
        pendingSignals: pending,
        previewSignal: { id: "sig_done" },
        scoreFrom: "2026-08-17",
        mode: "action",
      }),
    ).toEqual({
      isPendingReview: false,
      nextPendingPreviewId: "sig_a",
      scoreFrom: "2026-08-17",
      mode: "action",
    });
  });

  it("has no next pending when the queue is empty", () => {
    expect(
      buildSignalReviewTriage({
        pendingSignals: [],
        previewSignal: { id: "sig_done" },
      }).nextPendingPreviewId,
    ).toBeNull();
  });
});

describe("feedbackLabelForShortcutKey", () => {
  it("maps c / i / p case-insensitively", () => {
    expect(feedbackLabelForShortcutKey("C")).toBe("correct");
    expect(feedbackLabelForShortcutKey("i")).toBe("incorrect");
    expect(feedbackLabelForShortcutKey("P")).toBe("partially_correct");
    expect(feedbackLabelForShortcutKey("x")).toBeNull();
  });
});

describe("isMarkActedShortcutKey", () => {
  it("accepts A and Enter only", () => {
    expect(isMarkActedShortcutKey("a")).toBe(true);
    expect(isMarkActedShortcutKey("A")).toBe(true);
    expect(isMarkActedShortcutKey("Enter")).toBe(true);
    expect(isMarkActedShortcutKey("c")).toBe(false);
    expect(isMarkActedShortcutKey(" ")).toBe(false);
  });
});

describe("isActedEnterBlockedTarget", () => {
  it("blocks Enter steal on buttons and links", () => {
    const button = { tagName: "BUTTON" } as HTMLElement;
    const link = { tagName: "A" } as HTMLElement;
    const heading = { tagName: "H2" } as HTMLElement;

    expect(isActedEnterBlockedTarget(button)).toBe(true);
    expect(isActedEnterBlockedTarget(link)).toBe(true);
    expect(isActedEnterBlockedTarget(heading)).toBe(false);
  });
});

describe("isEditableShortcutTarget", () => {
  it("blocks shortcuts in inputs and textareas", () => {
    const input = { tagName: "INPUT", isContentEditable: false } as HTMLElement;
    const textarea = {
      tagName: "TEXTAREA",
      isContentEditable: false,
    } as HTMLElement;
    const button = {
      tagName: "BUTTON",
      isContentEditable: false,
    } as HTMLElement;

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(textarea)).toBe(true);
    expect(isEditableShortcutTarget(button)).toBe(false);
  });
});
