import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";

describe("homepage hero", () => {
  it("uses one opportunity headline with the conversation phrase highlighted", () => {
    const html = renderToStaticMarkup(createElement(Hero));
    expect(html).not.toContain("Sioona Conversation Intelligence");
    expect(html).toContain("hero-badge");
    expect(html).toContain('Your next opportunity is already in <span class="hero-headline-accent">the conversation.</span>');
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });
});
