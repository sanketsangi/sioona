import { describe, expect, it } from "vitest";
import {
  actionModeHref,
  afterMarkActedHref,
  cadenceActionHref,
  parseMode,
  parseStatusFilter,
  resolveInsightsStatusFilter,
  resolveWorkspaceMode,
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
});

describe("afterMarkActedHref", () => {
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

  it("preserves mode=action on empty Follow-up list", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: null,
        mode: "action",
      })
    ).toBe("/?view=insights&mode=action&status=followup");
  });

  it("returns the follow-up list when no Correct-not-Acted remain", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "followup",
        nextPreviewId: null,
      })
    ).toBe("/?view=insights&status=followup");
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

  it("returns the Pending list when no pending remain after Mark as Acted", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "new",
        nextPendingPreviewId: null,
      })
    ).toBe("/?view=insights&status=new");
  });

  it("returns Pending from All origin (not empty Follow-up)", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        statusFilter: "all",
        nextPendingPreviewId: null,
      })
    ).toBe("/?view=insights&status=new");
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
