import { describe, expect, it } from "vitest";
import { isCursorRefOnlyHydrationWarning } from "@/lib/cursor-ref-hydration";

const BANNER =
  "A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up.";

describe("isCursorRefOnlyHydrationWarning", () => {
  it("swallows React 19 diffs that only add data-cursor-ref", () => {
    const diff = `
                                <h1
                                  className="flex min-w-0 items-center gap-2 text-balance text-heading-20"
-                                 data-cursor-ref="e52"
                                >
+                                 Insights
                              <li
                                className="group/menu-item relative"
-                               data-cursor-ref="e51"
                              >
`;
    expect(
      isCursorRefOnlyHydrationWarning([
        `${BANNER}\n\n%s%s`,
        "https://react.dev/link/hydration-mismatch",
        diff,
      ]),
    ).toBe(true);
  });

  it("does not swallow diffs that include another extra attribute", () => {
    const diff = `
                                <h1
-                                 data-cursor-ref="e52"
-                                 data-theme="dark"
                                >
`;
    expect(
      isCursorRefOnlyHydrationWarning([
        `${BANNER}\n\n%s%s`,
        "https://react.dev/link/hydration-mismatch",
        diff,
      ]),
    ).toBe(false);
  });

  it("ignores unrelated console errors", () => {
    expect(isCursorRefOnlyHydrationWarning(["Failed to fetch"])).toBe(false);
  });
});
