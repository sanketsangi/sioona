import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Hero } from "./Hero";

describe("homepage hero", () => {
  it("uses the brand and product name as the only h1 text", () => {
    const html = renderToStaticMarkup(createElement(Hero));
    expect(html).toContain("<h1 id=\"hero-title\">Sioona Conversation Intelligence</h1>");
    expect(html).toContain("Your next opportunity is already in the conversation.");
    expect(html.match(/<h1\b/g)).toHaveLength(1);
  });
});
