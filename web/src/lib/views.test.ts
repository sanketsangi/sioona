import { describe, expect, it } from "vitest";
import { cadenceActionHref } from "./views";

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
