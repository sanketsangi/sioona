import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Footer } from "./Footer";
describe("Footer brand and navigation", () => {
  it("provides a labelled home link and the supplied decorative SVG", () => {
    const html = renderToStaticMarkup(createElement(Footer));
    expect(html).toMatch(/<a(?=[^>]*href="\/#top")(?=[^>]*aria-label="Sioona, home")[^>]*>/);
    expect(html).toContain('translate="no"');
    expect(html).toMatch(/<img(?=[^>]*src="\/sioona-footer.svg")(?=[^>]*alt="")(?=[^>]*width="43")(?=[^>]*height="43")[^>]*>/);
    expect(html).not.toContain('<h1');
  });
  it("keeps every navigation group and conversion path available", () => {
    const html = renderToStaticMarkup(createElement(Footer));
    for (const group of ['Product','Trust','Company']) expect(html).toContain(`aria-label="${group}"`);
    for (const href of ['/#insights','/#score','/how-it-works#top','/about#top','/security#top','/pricing#top','/contact#top','/developers#top','/#how','/#faq']) expect(html).toContain(`href="${href}"`);
    expect(html).toContain('Human judgment.');
  });
});
