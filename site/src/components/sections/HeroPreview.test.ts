import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { HeroPreview } from "./HeroPreview";
import { Reveal, RevealGroup, RevealItem } from "../motion/Reveal";
import { LazyMotion, domAnimation } from "framer-motion";
describe("Immediate first paint", () => {
  it("renders the product proof without observers or hydration", () => {
    const html = renderToStaticMarkup(createElement(HeroPreview, null, "Workspace"));
    expect(html).toContain('data-entered="true"');
    expect(html).toContain("Workspace");
    expect(html).not.toContain("opacity:0");
    expect(html).not.toContain("transform:");
  });
  it("renders headers and grouped cards without a hidden initial state", () => {
    const html = renderToStaticMarkup(createElement(LazyMotion, { features: domAnimation },
      createElement(Reveal, null, "Title"), createElement(RevealGroup, null, createElement(RevealItem, null, "Offer"))));
    expect(html).not.toContain("opacity:0");
    expect(html).not.toMatch(/translateY\([^0]/);
  });
});
