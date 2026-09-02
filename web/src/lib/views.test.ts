import { describe, expect, it } from "vitest";
import {
  actionModeHref,
  afterFeedbackHref,
  afterMarkActedHref,
  cadenceActionHref,
  nextPendingPreviewId,
  pendingReviewWalkHref,
  prevPendingPreviewId,
  parseMode,
  parseReplacedParam,
  parseStatusFilter,
  replacedQueryValue,
  resolveInsightsStatusFilter,
  resolveWorkspaceMode,
  shadowModeHref,
  skipPendingPreviewId,
  statusQueryValue,
} from "./views";

describe("parseMode", () => {
  it("accepts action", () => {
    expect(parseMode("action")).toBe("action");
  });

  it("defaults unknown and omitted values to shadow", () => {
    expect(parseMode("shadow")).toBe("shadow");
    expect(parseMode(undefined)).toBe("shadow");
    expect(parseMode(null)).toBe("shadow");
    expect(parseMode("nope")).toBe("shadow");
  });
});

describe("parseReplacedParam", () => {
  it("is true only for 1 or true", () => {
    expect(parseReplacedParam("1")).toBe(true);
    expect(parseReplacedParam("true")).toBe(true);
    expect(parseReplacedParam("0")).toBe(false);
    expect(parseReplacedParam(undefined)).toBe(false);
  });
});

describe("replacedQueryValue", () => {
  it("writes 1 only when true", () => {
    expect(replacedQueryValue(true)).toBe("1");
    expect(replacedQueryValue(false)).toBeNull();
    expect(replacedQueryValue(undefined)).toBeNull();
  });
});

describe("resolveWorkspaceMode", () => {
  it("bounces locked action deep-links to shadow", () => {
    expect(resolveWorkspaceMode("action", false)).toBe("shadow");
  });

  it("keeps action when unlocked", () => {
    expect(resolveWorkspaceMode("action", true)).toBe("action");
  });

  it("keeps shadow regardless of unlock", () => {
    expect(resolveWorkspaceMode("shadow", false)).toBe("shadow");
    expect(resolveWorkspaceMode(undefined, true)).toBe("shadow");
  });
});

describe("parseStatusFilter", () => {
  it("accepts followup and acted", () => {
    expect(parseStatusFilter("followup")).toBe("followup");
    expect(parseStatusFilter("acted")).toBe("acted");
    expect(parseStatusFilter("new")).toBe("new");
  });

  it("aliases reviewed to followup", () => {
    expect(parseStatusFilter("reviewed")).toBe("followup");
  });

  it("defaults unknown values to all in Shadow Mode", () => {
    expect(parseStatusFilter(undefined)).toBe("all");
    expect(parseStatusFilter("nope")).toBe("all");
  });

  it("defaults omitted status to followup in Action Mode", () => {
    expect(parseStatusFilter(undefined, "action")).toBe("followup");
    expect(parseStatusFilter(null, "action")).toBe("followup");
  });

  it("honors explicit all in Action Mode", () => {
    expect(parseStatusFilter("all", "action")).toBe("all");
  });
});

describe("resolveInsightsStatusFilter", () => {
  it("lands on Pending when omitted and Follow-up is empty with pending work", () => {
    expect(
      resolveInsightsStatusFilter({
        raw: undefined,
        mode: "shadow",
        pendingCount: 10,
        followUpCount: 0,
      })
    ).toBe("new");
    expect(
      resolveInsightsStatusFilter({
        raw: null,
        mode: "action",
        pendingCount: 10,
        followUpCount: 0,
      })
    ).toBe("new");
  });

  it("keeps Shadow all and Action followup when Follow-up has rows", () => {
    expect(
      resolveInsightsStatusFilter({
        raw: undefined,
        mode: "shadow",
        pendingCount: 10,
        followUpCount: 2,
      })
    ).toBe("all");
    expect(
      resolveInsightsStatusFilter({
        raw: undefined,
        mode: "action",
        pendingCount: 10,
        followUpCount: 2,
      })
    ).toBe("followup");
  });

  it("does not remap explicit followup (compact empty path)", () => {
    expect(
      resolveInsightsStatusFilter({
        raw: "followup",
        mode: "action",
        pendingCount: 10,
        followUpCount: 0,
      })
    ).toBe("followup");
  });

  it("aliases reviewed and honors unknown via parseStatusFilter", () => {
    expect(
      resolveInsightsStatusFilter({
        raw: "reviewed",
        mode: "shadow",
        pendingCount: 10,
        followUpCount: 0,
      })
    ).toBe("followup");
    expect(
      resolveInsightsStatusFilter({
        raw: "nope",
        mode: "shadow",
        pendingCount: 10,
        followUpCount: 0,
      })
    ).toBe("all");
  });
});

describe("statusQueryValue", () => {
  it("omits all in Shadow Mode", () => {
    expect(statusQueryValue("all", "shadow")).toBeNull();
  });

  it("writes all explicitly in Action Mode", () => {
    expect(statusQueryValue("all", "action")).toBe("all");
  });

  it("passes through non-all filters", () => {
    expect(statusQueryValue("followup", "action")).toBe("followup");
  });
});

describe("actionModeHref", () => {
  it("deep-links Insights with mode=action and omits status", () => {
    expect(actionModeHref()).toBe("/?view=insights&mode=action");
  });

  it("preserves scoreFrom and demo flags without forcing followup", () => {
    expect(
      actionModeHref({ scoreFrom: "2026-08-17", demo: "1" })
    ).toBe("/?view=insights&scoreFrom=2026-08-17&demo=1&mode=action");
  });
});

describe("shadowModeHref", () => {
  it("keeps filters and strips mode plus preview", () => {
    expect(
      shadowModeHref(
        new URLSearchParams(
          "view=insights&status=followup&preview=sig_neon_abc&mode=action&scoreFrom=2026-08-17",
        ),
      ),
    ).toBe(
      "/?view=insights&status=followup&scoreFrom=2026-08-17",
    );
  });

  it("matches with or without preview in the source query", () => {
    const withPreview = shadowModeHref(
      new URLSearchParams(
        "view=insights&status=followup&preview=sig_neon_abc",
      ),
    );
    const withoutPreview = shadowModeHref(
      new URLSearchParams("view=insights&status=followup"),
    );
    expect(withPreview).toBe(withoutPreview);
    expect(withPreview).toBe("/?view=insights&status=followup");
  });
});

describe("cadenceActionHref", () => {
  it("deep-links Mark Acted to the first Correct follow-up panel", () => {
    expect(
      cadenceActionHref(
        { id: "acted", label: "Mark Acted on Correct reviews" },
        { preview: "sig_keep", scoreFrom: "2026-08-17" }
      )
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=followup&preview=sig_keep"
    );
  });

  it("omits preview when none is provided", () => {
    expect(
      cadenceActionHref({ id: "acted", label: "Mark Acted on Correct reviews" })
    ).toBe("/?view=insights&status=followup");
  });

  it("keeps replaced=1 on the Follow-up cadence deep-link", () => {
    expect(
      cadenceActionHref(
        { id: "acted", label: "Mark Acted on Correct reviews" },
        { preview: "sig_keep", replaced: true }
      )
    ).toBe("/?view=insights&status=followup&preview=sig_keep&replaced=1");
  });
});

describe("nextPendingPreviewId", () => {
  const pending = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the next id and null at the end", () => {
    expect(nextPendingPreviewId(pending, "a")).toBe("b");
    expect(nextPendingPreviewId(pending, "b")).toBe("c");
    expect(nextPendingPreviewId(pending, "c")).toBeNull();
  });

  it("returns null when only one pending remains", () => {
    expect(nextPendingPreviewId([{ id: "solo" }], "solo")).toBeNull();
  });

  it("returns the first pending when current is not in the queue", () => {
    expect(nextPendingPreviewId(pending, "sig_followup")).toBe("a");
  });
});

describe("prevPendingPreviewId", () => {
  const pending = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the previous id and null at the start", () => {
    expect(prevPendingPreviewId(pending, "a")).toBeNull();
    expect(prevPendingPreviewId(pending, "b")).toBe("a");
    expect(prevPendingPreviewId(pending, "c")).toBe("b");
  });

  it("returns null when only one pending remains", () => {
    expect(prevPendingPreviewId([{ id: "solo" }], "solo")).toBeNull();
  });

  it("returns null when current is missing", () => {
    expect(prevPendingPreviewId(pending, "missing")).toBeNull();
  });
});

describe("skipPendingPreviewId", () => {
  const pending = [{ id: "a" }, { id: "b" }, { id: "c" }];

  it("returns the next id without wrapping", () => {
    expect(skipPendingPreviewId(pending, "a")).toBe("b");
    expect(skipPendingPreviewId(pending, "b")).toBe("c");
    expect(skipPendingPreviewId(pending, "c")).toBeNull();
  });

  it("returns null for the last or only pending", () => {
    expect(skipPendingPreviewId([{ id: "solo" }], "solo")).toBeNull();
  });

  it("points at the first pending when current is follow-up / Done", () => {
    expect(skipPendingPreviewId(pending, "sig_followup")).toBe("a");
  });
});

describe("pendingReviewWalkHref", () => {
  it("opens the next preview and keeps scoreFrom, type, and status", () => {
    expect(
      pendingReviewWalkHref({
        previewId: "sig_b",
        statusFilter: "new",
        typeFilter: "retention",
        scoreFrom: "2026-08-17",
      }),
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=new&type=retention&preview=sig_b",
    );
  });

  it("drops preview on last Skip and keeps filters", () => {
    expect(
      pendingReviewWalkHref({
        previewId: null,
        statusFilter: "new",
        typeFilter: "retention",
        scoreFrom: "2026-08-17",
      }),
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=new&type=retention",
    );
  });

  it("preserves mode=action", () => {
    expect(
      pendingReviewWalkHref({
        previewId: "sig_b",
        statusFilter: "new",
        mode: "action",
      }),
    ).toBe("/?view=insights&mode=action&status=new&preview=sig_b");
  });

  it("keeps replaced=1 on Prev / Next / Skip", () => {
    expect(
      pendingReviewWalkHref({
        previewId: "sig_b",
        statusFilter: "new",
        replaced: true,
      }),
    ).toBe("/?view=insights&status=new&preview=sig_b&replaced=1");
    expect(
      pendingReviewWalkHref({
        previewId: null,
        statusFilter: "new",
        replaced: true,
      }),
    ).toBe("/?view=insights&status=new&replaced=1");
  });
});

describe("afterFeedbackHref", () => {
  it("opens Follow-up for the same signal after Correct on needs-review", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "correct",
        currentSignalId: "sig_keep",
        nextPendingPreviewId: "sig_next",
        scoreFrom: "2026-08-17",
      }),
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=followup&preview=sig_keep",
    );
  });

  it("keeps replaced=1 after Correct and Incorrect", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "correct",
        currentSignalId: "sig_keep",
        replaced: true,
      }),
    ).toBe("/?view=insights&status=followup&preview=sig_keep&replaced=1");
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "incorrect",
        nextPendingPreviewId: "sig_next",
        replaced: true,
      }),
    ).toBe("/?view=insights&status=new&preview=sig_next&replaced=1");
  });

  it("preserves mode=action on Correct → Follow-up", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "correct",
        currentSignalId: "sig_keep",
        nextPendingPreviewId: "sig_next",
        mode: "action",
      }),
    ).toBe(
      "/?view=insights&mode=action&status=followup&preview=sig_keep",
    );
  });

  it("opens the next pending review after Incorrect on needs-review", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "incorrect",
        currentSignalId: "sig_keep",
        nextPendingPreviewId: "sig_next",
        scoreFrom: "2026-08-17",
      }),
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=new&preview=sig_next",
    );
  });

  it("opens the next pending after Partially Correct", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "partially_correct",
        currentSignalId: "sig_keep",
        nextPendingPreviewId: "sig_next",
      }),
    ).toBe("/?view=insights&status=new&preview=sig_next");
  });

  it("returns the Pending list when no pending remain after Incorrect", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "incorrect",
        currentSignalId: "sig_solo",
        nextPendingPreviewId: null,
      }),
    ).toBe("/?view=insights&status=new");
  });

  it("preserves mode=action on Incorrect advance", () => {
    expect(
      afterFeedbackHref({
        wasPending: true,
        label: "incorrect",
        currentSignalId: "sig_keep",
        nextPendingPreviewId: "sig_next",
        mode: "action",
      }),
    ).toBe("/?view=insights&mode=action&status=new&preview=sig_next");
  });

  it("stays on the panel when re-editing reviewed feedback", () => {
    expect(
      afterFeedbackHref({
        wasPending: false,
        label: "correct",
        currentSignalId: "sig_keep",
        nextPendingPreviewId: "sig_next",
      }),
    ).toBeNull();
  });
});

describe("afterMarkActedHref", () => {
  it("prefers the next Correct review over pending when both exist", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "new",
        nextPreviewId: "sig_correct_next",
        nextPendingPreviewId: "sig_pending_next",
      })
    ).toBe("/?view=insights&status=followup&preview=sig_correct_next");
  });

  it("keeps replaced=1 on next Correct and next pending", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        nextPreviewId: "sig_correct_next",
        replaced: true,
      })
    ).toBe(
      "/?view=insights&status=followup&preview=sig_correct_next&replaced=1"
    );
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        nextPendingPreviewId: "sig_pending_next",
        replaced: true,
      })
    ).toBe(
      "/?view=insights&status=new&preview=sig_pending_next&replaced=1"
    );
  });

  it("opens the next Correct review after Mark as Acted on Follow-up", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: "sig_next",
        scoreFrom: "2026-08-17",
      })
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=followup&preview=sig_next"
    );
  });

  it("preserves mode=action on next Follow-up panel", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: "sig_next",
        mode: "action",
      })
    ).toBe(
      "/?view=insights&mode=action&status=followup&preview=sig_next"
    );
  });

  it("opens the next pending review when no Correct-not-Acted remain", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: null,
        nextPendingPreviewId: "sig_pending_next",
        scoreFrom: "2026-08-17",
      })
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=new&preview=sig_pending_next"
    );
  });

  it("preserves mode=action on next pending after last Follow-up Acted", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: null,
        nextPendingPreviewId: "sig_pending_next",
        mode: "action",
      })
    ).toBe(
      "/?view=insights&mode=action&status=new&preview=sig_pending_next"
    );
  });

  it("opens the next pending review after Mark as Acted from Pending", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "new",
        nextPendingPreviewId: "sig_pending_next",
        scoreFrom: "2026-08-17",
      })
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=new&preview=sig_pending_next"
    );
  });

  it("stays on the panel when no Correct or pending reviews remain", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: null,
        nextPendingPreviewId: null,
        mode: "action",
      })
    ).toBeNull();
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "new",
        nextPendingPreviewId: null,
      })
    ).toBeNull();
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "all",
        nextPendingPreviewId: null,
      })
    ).toBeNull();
  });

  it("stays on the panel for undo or non-Correct reviews", () => {
    expect(
      afterMarkActedHref({
        acted: false,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: "sig_next",
      })
    ).toBeNull();
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "incorrect",
        statusFilter: "new",
        nextPendingPreviewId: "sig_next",
      })
    ).toBeNull();
  });
});
