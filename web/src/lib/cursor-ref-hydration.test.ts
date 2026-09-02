import { afterEach, describe, expect, it, vi } from "vitest";
import {
  installCursorRefHydrationFilter,
  isCursorRefOnlyHydrationWarning,
  resetCursorRefHydrationFilterForTests,
} from "@/lib/cursor-ref-hydration";

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

  it("swallows Next overlay dumps that only extra data-cursor-ref on sidebar chrome", () => {
    const overlay = `
A tree hydrated but some attributes of the server rendered HTML didn't match the client properties. This won't be patched up. This can happen if a SSR-ed Client Component used:

- A server/client branch \`if (typeof window !== 'undefined')\`.
- Variable input such as \`Date.now()\` or \`Math.random()\` which changes each time it's called.

https://react.dev/link/hydration-mismatch

                                          <li
                                            ref={null}
                                            data-sidebar="menu-item"
                                            className="group/menu-item relative group/collapsible"
-                                           data-cursor-ref="e51"
                                          >
                                                    <button
                                                      type="button"
                                                      data-sidebar="menu-button"
-                                                     data-cursor-ref="e7"
                                                    >
                                                            <a
                                                              href="/?view=upload"
-                                                             data-cursor-ref="e8"
                                                            >

    at SidebarMenuButton (src/components/ui/sidebar.tsx:594:7)
    at VaultNav (src/components/AppSidebar.tsx:144:17)
`;
    expect(isCursorRefOnlyHydrationWarning([overlay])).toBe(true);
  });
});

describe("installCursorRefHydrationFilter", () => {
  afterEach(() => {
    resetCursorRefHydrationFilterForTests();
    vi.restoreAllMocks();
  });

  it("does not forward cursor-ref hydration warnings to console.error", () => {
    const spy = vi.fn();
    const original = console.error;
    console.error = spy as typeof console.error;
    installCursorRefHydrationFilter();
    console.error(
      `${BANNER}\n\n%s%s`,
      "https://react.dev/link/hydration-mismatch",
      `-                                 data-cursor-ref="e51"`,
    );
    expect(spy).not.toHaveBeenCalled();
    console.error("Failed to fetch");
    expect(spy).toHaveBeenCalledWith("Failed to fetch");
    resetCursorRefHydrationFilterForTests();
    console.error = original;
  });

  it("still swallows after Next.js assigns over console.error", () => {
    const native = vi.fn();
    const original = console.error;
    console.error = native as typeof console.error;
    installCursorRefHydrationFilter();
    const origin = console.error;
    const overlay = vi.fn((...args: unknown[]) => {
      origin.apply(console, args);
    });
    console.error = overlay as typeof console.error;

    console.error(
      `${BANNER}\n\n%s%s`,
      "https://react.dev/link/hydration-mismatch",
      `-                             data-cursor-ref="e0"`,
    );
    expect(overlay).not.toHaveBeenCalled();
    expect(native).not.toHaveBeenCalled();

    console.error("Failed to fetch");
    expect(overlay).toHaveBeenCalledWith("Failed to fetch");
    expect(native).toHaveBeenCalledWith("Failed to fetch");

    resetCursorRefHydrationFilterForTests();
    console.error = original;
  });
});
