import { describe, expect, it } from "vitest";
import { aboutDescription } from "./about";
import { markdownDocument, markdownFor, markdownNotFound } from "./markdown-pages";
import { routes, siteConfig } from "./site";

describe("markdown pages", () => {
  it("has a markdown body for every public route", () => {
    for (const route of routes) {
      const body = markdownFor(route)!;
      expect(body).toContain("Canonical:");
      expect(body).toContain("## When to use Sioona");
      for (const path of ["/.well-known/mcp", "/mcp", "/llms.txt", "/how-it-works", "/security", "/sitemap.xml"]) expect(body).toContain(path);
      for (const heading of body.match(/^#+ .+$/gm) ?? []) expect(heading).toContain("Sioona");
      for (const term of ["Intercom", "WhatsApp", "CSV", "XLSX", "email", "notifications/initialized", "tools/list", "tools/call"]) expect(body).toContain(term);
    }
  });

  it("describes Sioona on /about in more than 500 characters", () => {
    expect(aboutDescription().length).toBeGreaterThan(500);
    const about = markdownFor("/about");
    expect(about).toContain("Shadow Mode");
    expect(about!.length).toBeGreaterThan(500);
  });

  it("returns a structured markdown 404 with links home, to the sitemap, and to llms.txt", () => {
    const body = markdownNotFound("/missing-page");
    expect(body).toContain("# Page not found");
    expect(body).toContain("`/missing-page`");
    expect(body).toContain(`](${new URL("/", siteConfig.url).toString()})`);
    expect(body).toContain(`](${new URL("/sitemap.xml", siteConfig.url).toString()})`);
    expect(body).toContain(`](${new URL("/llms.txt", siteConfig.url).toString()})`);
  });

  it("serves markdown for known pages and a 404 for unknown paths", () => {
    expect(markdownDocument("/security", "text/markdown")?.status).toBe(200);
    expect(markdownDocument("/no-such-page", "text/markdown")?.status).toBe(404);
    expect(markdownDocument("/no-such-page", "text/markdown")?.body).toContain("/llms.txt");
  });

  it("leaves HTML, API, and agent-index routes to the app", () => {
    expect(markdownDocument("/about", "text/html")).toBeNull();
    expect(markdownDocument("/api/contact", "text/markdown")).toBeNull();
    expect(markdownDocument("/llms.txt", "text/markdown")).toBeNull();
    expect(markdownDocument("/sitemap.xml", "text/markdown")).toBeNull();
  });
});
