// @vitest-environment jsdom
import { createElement, type ComponentType } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Metadata } from "next";
import { describe, expect, it } from "vitest";
import { GET as llms, dynamic as llmsRendering } from "@/app/llms.txt/route";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";
import { howToJsonLd, organizationJsonLd, routes, serviceJsonLd, siteConfig, websiteJsonLd } from "./site";

const pages = import.meta.glob("../app/**/page.tsx", { eager: true }) as unknown as Record<string, { default: ComponentType; metadata: Metadata }>;
const pageFor = (path: string) => pages[`../app${path === "/" ? "" : path}/page.tsx`];
function titleOf(metadata: Metadata): string {
  if (typeof metadata.title === "string") return metadata.title;
  return metadata.title && "absolute" in metadata.title ? metadata.title.absolute : "";
}

describe("public route SEO contract", () => {
  it("publishes unique titles and descriptions within the requested search bounds", () => {
    const titles: string[] = [], descriptions: string[] = [];
    for (const path of routes) {
      const metadata = pageFor(path).metadata;
      const title = titleOf(metadata), description = metadata.description ?? "";
      expect(title.length, path).toBeGreaterThanOrEqual(35);
      expect(title.length, path).toBeLessThanOrEqual(60);
      // Absolute titles keep the parent template from silently exceeding the bound.
      expect(metadata.title, path).toEqual({ absolute: title });
      expect(description.length, path).toBeGreaterThanOrEqual(120);
      expect(description.length, path).toBeLessThanOrEqual(158);
      titles.push(title); descriptions.push(description);
    }
    expect(new Set(titles).size).toBe(routes.length);
    expect(new Set(descriptions).size).toBe(routes.length);
  });

  for (const path of routes) {
    it(`${path}: canonical, language alternates, headings, breadcrumbs and contextual links`, () => {
      const page = pageFor(path), url = new URL(path, siteConfig.url).href;
      expect(page.metadata.alternates).toEqual({ canonical: url, languages: { "en-IN": url, "en-US": url, en: url, "x-default": url } });
      const content = document.createElement("div");
      content.innerHTML = renderToStaticMarkup(createElement(page.default));
      expect(content.querySelectorAll("h1")).toHaveLength(1);
      let level = 0;
      for (const heading of content.querySelectorAll("h1,h2,h3,h4,h5,h6")) {
        const next = Number(heading.tagName.slice(1));
        expect(next, heading.textContent ?? path).toBeLessThanOrEqual(level + 1);
        level = next;
      }
      const graphs = Array.from(content.querySelectorAll('script[type="application/ld+json"]'), script => JSON.parse(script.textContent!));
      if (path !== "/") {
        const crumbs = graphs.filter(graph => graph["@type"] === "BreadcrumbList");
        expect(crumbs).toHaveLength(1);
        expect(crumbs[0].itemListElement.map((item: { item: string }) => item.item)).toEqual([new URL("/", siteConfig.url).href, url]);
      }
      const related = content.querySelector('nav[aria-label="Related resources"]');
      expect(related).not.toBeNull();
      const links = Array.from(related!.querySelectorAll("a"));
      expect(links.length).toBeGreaterThanOrEqual(2);
      for (const link of links) {
        expect(routes).toContain(link.getAttribute("href"));
        expect(link.getAttribute("href")).not.toBe(path);
        expect(link.textContent!.trim().length).toBeGreaterThan(12);
      }
      const graph = [organizationJsonLd(), websiteJsonLd(), serviceJsonLd(), ...graphs];
      const definitions = new Set<string>(graph.map(entity => entity["@id"]).filter(Boolean)), references: string[] = [];
      function visit(value: unknown) {
        if (!value || typeof value !== "object") return;
        const object = value as Record<string, unknown>;
        if (typeof object["@id"] === "string") {
          references.push(object["@id"]);
          expect(new URL(object["@id"]).origin).toBe(siteConfig.url);
        }
        for (const item of Object.values(object)) visit(item);
      }
      visit(graph);
      for (const ref of references) expect(definitions.has(ref), `${path}: undefined ${ref}`).toBe(true);
    });
  }

  it("gives the workflow a stable identity linked to the product and publisher", () => {
    expect(howToJsonLd()).toMatchObject({ "@id": `${siteConfig.url}/#review-workflow`, about: { "@id": `${siteConfig.url}/#product` }, publisher: { "@id": `${siteConfig.url}/#organization` } });
  });

  it("covers canonical pages in llms, robots and sitemap without claiming hosted isolation", async () => {
    const response = llms(), body = await response.text();
    expect(llmsRendering).toBe("force-static");
    expect(response.headers.get("content-type")).toContain("text/plain");
    expect(body.match(/^# /gm)).toHaveLength(1);
    for (const path of routes) expect(body).toContain(new URL(path, siteConfig.url).href);
    for (const format of ["CSV", "JSON", "WhatsApp TXT", "XLSX", "EML", "MBOX", "verified Intercom"]) expect(body).toContain(format);
    expect(body).toContain("row-level security (RLS)");
    expect(body).toContain("hosted acceptance");
    expect(body).toContain("No public list price is published");
    expect(sitemap().map(item => item.url).sort()).toEqual([...routes, "/llms.txt"].map(path => new URL(path, siteConfig.url).href).sort());
    expect(robots().sitemap).toBe(new URL("/sitemap.xml", siteConfig.url).href);
    const rules = robots().rules as { userAgent: string; allow: string; disallow: string[] }[];
    for (const crawler of ["OAI-SearchBot", "ChatGPT-User", "PerplexityBot", "ClaudeBot"]) expect(rules).toContainEqual({ userAgent: crawler, allow: "/", disallow: ["/api/"] });
  });
});
