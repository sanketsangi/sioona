import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import DevelopersPage from "./page";

describe("developer resources page", () => {
  it("names Sioona in the title and links the MCP server", () => {
    const html = renderToStaticMarkup(createElement(DevelopersPage));
    expect(html).toContain("Sioona developer resources");
    expect(html).toContain("Sioona MCP server");
    expect(html).toContain('href="/.well-known/mcp"');
    expect(html).toContain('href="#developers-mcp-title"');
    expect(html).toContain('href="/llms.txt"');
    expect(html).toContain("BreadcrumbList");
    expect(html).toContain("sioona_list_pages");
    expect(html).toContain("query");
  });
});
