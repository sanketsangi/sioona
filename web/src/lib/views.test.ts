import { describe, expect, it } from "vitest";
import { afterMarkActedHref, cadenceActionHref } from "./views";

describe("cadenceActionHref", () => {
  it("deep-links Mark Acted to the first Correct review panel", () => {
    expect(
      cadenceActionHref(
        { id: "acted", label: "Mark Acted on Correct reviews" },
        { preview: "sig_keep", scoreFrom: "2026-08-17" }
      )
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=reviewed&preview=sig_keep"
    );
  });

  it("omits preview when none is provided", () => {
    expect(
      cadenceActionHref({ id: "acted", label: "Mark Acted on Correct reviews" })
    ).toBe("/?view=insights&status=reviewed");
  });
});

describe("afterMarkActedHref", () => {
  it("opens the next Correct review after Mark as Acted", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        nextPreviewId: "sig_next",
        scoreFrom: "2026-08-17",
      })
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=reviewed&preview=sig_next"
    );
  });

  it("returns the Insights queue when no Correct-not-Acted remain", () => {
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "correct",
        nextPreviewId: null,
      })
    ).toBe("/?view=insights");
  });

  it("stays on the panel for undo or non-Correct reviews", () => {
    expect(
      afterMarkActedHref({
        acted: false,
        feedbackLabel: "correct",
        nextPreviewId: "sig_next",
      })
    ).toBeNull();
    expect(
      afterMarkActedHref({
        acted: true,
        feedbackLabel: "incorrect",
        nextPreviewId: "sig_next",
      })
    ).toBeNull();
  });
});

describe("cadenceActionHref", () => {
  it("deep-links Mark Acted to the first Correct review panel", () => {
    expect(
      cadenceActionHref(
        { id: "acted", label: "Mark Acted on Correct reviews" },
        { preview: "sig_keep", scoreFrom: "2026-08-17" }
      )
    ).toBe(
      "/?view=insights&scoreFrom=2026-08-17&status=reviewed&preview=sig_keep"
    );
  });

  it("omits preview when none is provided", () => {
    expect(
      cadenceActionHref({ id: "acted", label: "Mark Acted on Correct reviews" })
    ).toBe("/?view=insights&status=reviewed");
  });
});
