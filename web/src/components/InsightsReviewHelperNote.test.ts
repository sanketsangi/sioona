import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightsReviewHelperNote } from "@/components/InsightsReviewHelperNote";

describe("InsightsReviewHelperNote", () => {
  it("uses Geist Note density with muted fill and subtle border", () => {
    const html = renderToStaticMarkup(
      createElement(InsightsReviewHelperNote, null, "Helper copy."),
    );

    expect(html).toContain('role="note"');
    expect(html).toContain("Helper copy.");
    expect(html).toContain(
      "min-h-10 flex-row flex-wrap items-center gap-2 rounded-md border-sio-border-subtle bg-sio-bg-muted px-3 py-1.5",
    );
    expect(html).toContain("pr-10");
    expect(html).toContain("text-pretty text-copy-14 text-sio-fg-subtle");
    expect(html).toContain('data-slot="geist-icon"');
    expect(html).toContain('data-glyph="circular"');
    expect(html).not.toContain("text-label-12");
    expect(html).not.toContain("bg-sio-bg-base");
    expect(html).not.toContain("border-sio-border-base");
    expect(html).not.toContain("px-2.5 py-2");
  });

  it("keeps helper density with a compact trailing action", () => {
    const html = renderToStaticMarkup(
      createElement(
        InsightsReviewHelperNote,
        {
          action: createElement("a", { href: "/?view=eval&panel=adapt" }, "Adapt"),
        },
        "False positive?",
      ),
    );

    expect(html).toContain('role="note"');
    expect(html).toContain("False positive?");
    expect(html).toContain("Adapt");
    expect(html).toContain("min-h-10");
    expect(html).toContain("justify-between gap-x-3 pr-3");
    expect(html).toContain("text-pretty text-copy-14 text-sio-fg-subtle");
    expect(html).not.toContain("pr-10 md:justify-start");
    expect(html).not.toContain("px-2.5 py-2");
    expect(html).not.toContain("min-h-11");
  });
});
