import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children?: unknown;
    className?: string;
  }) => createElement("a", { href, className }, children as never),
}));

import { TaxonomyView } from "./TaxonomyView";

function markup(
  props: Parameters<typeof TaxonomyView>[0] = {}
): string {
  return renderToStaticMarkup(createElement(TaxonomyView, props));
}

describe("TaxonomyView stored overrides", () => {
  it("renders stored phrases and negative phrases and keeps base examples", () => {
    const html = markup({
      taxonomyOverrides: {
        lead: {
          phrases: [" demat account ", ""],
          negativePhrases: ["first time"],
          keywords: ["hidden keyword"],
        },
      },
    });

    expect(html).toContain("New here — how do I apply for a credit card");
    expect(html).toContain("“demat account”");
    expect(html).not.toContain("“”");
    expect(html).toContain("“first time”");
    expect(html).not.toContain("hidden keyword");
    expect(html).toContain("Example Utterances");
    expect(html).toContain("Stored phrase overrides");
    expect(html).toContain("Stored negative phrase overrides");
  });

  it("shows an explicit empty state instead of a list when a type has no overrides", () => {
    const html = markup({ taxonomyOverrides: {} });
    const phrasesHeading = html.indexOf(">Stored phrase overrides</h3>");
    const negativesHeading = html.indexOf(">Stored negative phrase overrides</h3>");
    const afterPhrases = html.slice(phrasesHeading, negativesHeading);
    const afterNegatives = html.slice(negativesHeading);

    expect(html).toContain("New here — how do I apply for a credit card");
    expect(afterPhrases).toContain("No phrases stored");
    expect(afterPhrases).not.toContain("<ul");
    expect(afterNegatives).toContain("No negative phrases stored");
    expect(afterNegatives).not.toContain("<ul");
    expect(html).not.toContain("<input");
    expect(html).not.toContain("Add Phrase");
  });

  it("lists overrides only for the paged type", () => {
    const html = markup({
      typePageRaw: "2",
      taxonomyOverrides: {
        lead: { phrases: ["demat account"] },
        retention: { negativePhrases: ["just browsing"] },
      },
    });

    expect(html).toContain("Your competitor is cheaper and faster");
    expect(html).not.toContain("demat account");
    expect(html).toContain("“just browsing”");
    expect(html).toContain("No phrases stored");
  });
});
