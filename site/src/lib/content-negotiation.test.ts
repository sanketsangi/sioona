import { describe, expect, it } from "vitest";
import { prefersMarkdown } from "./content-negotiation";

const browser = "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8";

describe("prefersMarkdown", () => {
  it("keeps browser and HTML requests on the HTML page", () => {
    expect(prefersMarkdown(null)).toBe(false);
    expect(prefersMarkdown("text/html")).toBe(false);
    expect(prefersMarkdown(browser)).toBe(false);
    expect(prefersMarkdown("text/html, text/markdown;q=0.1")).toBe(false);
    expect(prefersMarkdown("*/*")).toBe(false);
  });

  it("rejects disabled or malformed quality values and preserves HTML ties", () => {
    for (const value of ["0", "-1", "2", "Infinity", "invalid"]) expect(prefersMarkdown(`text/markdown;q=${value}`)).toBe(false);
    expect(prefersMarkdown("text/html, text/markdown")).toBe(false);
    expect(prefersMarkdown("TEXT/MARKDOWN;Q=0.9,text/html;q=0.1")).toBe(true);
  });

  it("serves markdown only when that type outranks HTML", () => {
    expect(prefersMarkdown("text/markdown")).toBe(true);
    expect(prefersMarkdown("text/markdown, text/html;q=0.5")).toBe(true);
  });
});
