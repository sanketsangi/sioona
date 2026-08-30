import { describe, expect, it } from "vitest";
import { insightsStatusCanonicalUrl } from "./CanonicalizeInsightsStatus";

describe("insightsStatusCanonicalUrl", () => {
  it("adds status=new when status omitted and filter is new", () => {
    expect(
      insightsStatusCanonicalUrl(
        "?view=insights&scoreFrom=2026-08-17",
        "new",
        "shadow",
        true,
      ),
    ).toBe("/?view=insights&scoreFrom=2026-08-17&status=new");
  });

  it("returns null when status was explicit in the request", () => {
    expect(
      insightsStatusCanonicalUrl(
        "?view=insights&status=followup",
        "followup",
        "shadow",
        false,
      ),
    ).toBeNull();
  });

  it("returns null when expected query value is null (Shadow all)", () => {
    expect(
      insightsStatusCanonicalUrl("?view=insights", "all", "shadow", true),
    ).toBeNull();
  });

  it("adds status=followup for Action omitted landing", () => {
    expect(
      insightsStatusCanonicalUrl(
        "?view=insights&mode=action",
        "followup",
        "action",
        true,
      ),
    ).toBe("/?view=insights&mode=action&status=followup");
  });

  it("does not override a status already present in the search string", () => {
    expect(
      insightsStatusCanonicalUrl(
        "?view=insights&status=done",
        "new",
        "shadow",
        true,
      ),
    ).toBeNull();
  });
});
