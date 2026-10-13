import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { aboutDescription } from "@/lib/about";
import AboutPage from "./page";

describe("about page", () => {
  it("renders the trust-anchor description", () => {
    const html = renderToStaticMarkup(createElement(AboutPage));
    expect(aboutDescription().length).toBeGreaterThan(500);
    expect(html).toContain("How a pilot stays in human hands");
    expect(html).toContain("not a chatbot");
    expect(html).toContain("Shadow\u00a0Mode");
    expect(html).toContain('href="/contact"');
    expect(html).toContain('href="/how-it-works"');
    expect(html.length).toBeGreaterThan(500);
  });
});
