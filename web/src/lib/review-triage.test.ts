import { describe, expect, it } from "vitest";
import {
  buildSignalReviewTriage,
  feedbackLabelForShortcutKey,
  isActedEnterBlockedTarget,
  isEditableShortcutTarget,
  isMarkActedShortcutKey,
  pendingWalkShortcutForKey,
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
      prevPendingPreviewId: null,
      nextPendingPreviewId: "sig_b",
      scoreFrom: undefined,
      mode: undefined,
      replaced: undefined,
      typeFilter: undefined,
      actionFilter: undefined,
    });
  });

  it("disables Next on the last pending", () => {
    expect(
      buildSignalReviewTriage({
        pendingSignals: pending,
        previewSignal: { id: "sig_b" },
      }),
    ).toEqual({
      isPendingReview: true,
      prevPendingPreviewId: "sig_a",
      nextPendingPreviewId: null,
      scoreFrom: undefined,
      mode: undefined,
      replaced: undefined,
      typeFilter: undefined,
      actionFilter: undefined,
    });
  });

  it("walks the filtered subset while keeping isPendingReview on full pending", () => {
    expect(
      buildSignalReviewTriage({
        pendingSignals: pending,
        walkPendingSignals: [{ id: "sig_b" }],
        previewSignal: { id: "sig_a" },
        actionFilter: "approve",
        typeFilter: "retention",
      }),
    ).toEqual({
      isPendingReview: true,
      prevPendingPreviewId: null,
      nextPendingPreviewId: "sig_b",
      scoreFrom: undefined,
      mode: undefined,
      replaced: undefined,
      typeFilter: "retention",
      actionFilter: "approve",
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
      prevPendingPreviewId: null,
      nextPendingPreviewId: "sig_a",
      scoreFrom: "2026-08-17",
      mode: "action",
      replaced: undefined,
      typeFilter: undefined,
      actionFilter: undefined,
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

describe("pendingWalkShortcutForKey", () => {
  it("maps J to next and K to prev, case-insensitively", () => {
    expect(pendingWalkShortcutForKey("j")).toBe("next");
    expect(pendingWalkShortcutForKey("J")).toBe("next");
    expect(pendingWalkShortcutForKey("k")).toBe("prev");
    expect(pendingWalkShortcutForKey("K")).toBe("prev");
    expect(pendingWalkShortcutForKey("c")).toBeNull();
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

    const select = {
      tagName: "SELECT",
      isContentEditable: false,
    } as HTMLElement;
    const editable = {
      tagName: "DIV",
      isContentEditable: true,
    } as HTMLElement;

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(textarea)).toBe(true);
    expect(isEditableShortcutTarget(select)).toBe(true);
    expect(isEditableShortcutTarget(editable)).toBe(true);
    expect(isEditableShortcutTarget(button)).toBe(false);
  });
});
