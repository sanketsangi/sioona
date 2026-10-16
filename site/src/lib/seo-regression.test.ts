import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import Home, { metadata as homeMetadata } from "@/app/page";
import About, { metadata as aboutMetadata } from "@/app/about/page";
import Workflow, { metadata as workflowMetadata } from "@/app/how-it-works/page";
import Security, { metadata as securityMetadata } from "@/app/security/page";
import Pricing, { metadata as pricingMetadata } from "@/app/pricing/page";
import Contact, { metadata as contactMetadata } from "@/app/contact/page";
import Developers, { metadata as developersMetadata } from "@/app/developers/page";
import Privacy, { metadata as privacyMetadata } from "@/app/privacy/page";
import Terms, { metadata as termsMetadata } from "@/app/terms/page";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import { GET } from "@/app/llms.txt/route";
import { routes, seoPages, siteConfig, siteJsonLdGraph, jsonLdScript } from "./site";

const pages = [Home, About, Workflow, Security, Pricing, Contact, Developers, Privacy, Terms];
const metadata = [homeMetadata, aboutMetadata, workflowMetadata, securityMetadata, pricingMetadata, contactMetadata, developersMetadata, privacyMetadata, termsMetadata];

describe("public SEO contracts", () => {
  it("bounds actual route titles and descriptions without a layout suffix", () => {
    const titles = new Set(), descriptions = new Set();
    routes.forEach((route, i) => {
      const data = metadata[i];
      expect(data.title).toEqual({ absolute: seoPages[route].title });
      const title = seoPages[route].title;
      expect(title.length).toBeGreaterThanOrEqual(35);
      expect(title.length).toBeLessThanOrEqual(60);
      const description = String(data.description);
      expect(description.length).toBeGreaterThanOrEqual(120);
      expect(description.length).toBeLessThanOrEqual(158);
      titles.add(title); descriptions.add(description);
      const url = new URL(route, siteConfig.url).href;
      expect(data.alternates?.canonical).toBe(url);
      expect(data.alternates?.languages).toEqual({ "en-IN": url, "en-US": url, en: url, "x-default": url });
      expect(data.openGraph?.url).toBe(route);
    });
    expect(titles.size).toBe(routes.length);
    expect(descriptions.size).toBe(routes.length);
    expect(Object.keys(seoPages)).toEqual([...routes]);
  });

  it("renders one h1 and an ordered heading hierarchy on every route", () => {
    pages.forEach((Page, i) => {
      const html = renderToStaticMarkup(createElement(Page));
      expect(html.match(/<h1\b/g), routes[i]).toHaveLength(1);
      expect(html, routes[i]).toMatch(/<h2\b/);
      let previous = 0;
      for (const heading of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/g)) {
        const level = Number(heading[1]);
        expect(level, `${routes[i]}: ${heading[2].slice(0, 90)}`).toBeLessThanOrEqual(previous + 1);
        expect(heading[2].replace(/<[^>]*>/g, "").trim()).not.toBe("");
        previous = level;
      }
      expect(html).toMatch(/<a\b[^>]*href="\//);
    });
  });

  it("connects graph references and validates the seven required entity types", () => {
    const graph = siteJsonLdGraph();
    const ids = new Set(graph["@graph"].map(node => node["@id"]));
    const required: Record<string, string[]> = { Organization: ["name", "url"], WebSite: ["name", "url", "publisher"], Service: ["name", "provider"], Product: ["name", "brand"], SoftwareApplication: ["name", "applicationCategory", "operatingSystem"], HowTo: ["name", "step"], BreadcrumbList: ["itemListElement"] };
    const types = new Set();
    pages.forEach((Page, i) => {
      const html = renderToStaticMarkup(createElement(Page));
      const nodes = [...graph["@graph"], ...[...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(match => JSON.parse(match[1]))];
      expect(nodes.some(node => node["@type"] === "BreadcrumbList"), routes[i]).toBe(true);
      for (const node of nodes) {
        types.add(node["@type"]);
        for (const field of required[node["@type"]] || []) expect(node[field], `${node["@type"]}.${field}`).toBeTruthy();
        if (node["@type"] === "BreadcrumbList") node.itemListElement.forEach((item: { position: number; item: string }, j: number) => {
          expect(item.position).toBe(j + 1);
          expect(new URL(item.item).origin).toBe(siteConfig.url);
        });
        for (const key of ["provider", "publisher"]) if (node[key]?.["@id"]) expect(ids.has(node[key]["@id"])).toBe(true);
      }
    });
    for (const type of Object.keys(required)) expect(types.has(type), type).toBe(true);
    expect(jsonLdScript({ name: "</script><script>" })).not.toContain("<");
  });

  it("keeps sitemap, crawler access and llms discovery complete", async () => {
    const entries = sitemap();
    const urls = entries.map(entry => entry.url);
    const llms = await GET().text();
    for (const route of routes) {
      const url = new URL(route, siteConfig.url).href;
      expect(urls).toContain(url);
      expect(llms).toContain(`](${url})`);
      expect(entries.find(entry => entry.url === url)?.alternates?.languages).toEqual({ "en-IN": url, "en-US": url, en: url, "x-default": url });
    }
    expect(new Set(urls).size).toBe(urls.length);
    const rules = robots().rules as { userAgent: string; allow: string; disallow: string[] }[];
    for (const bot of ["Googlebot", "bingbot", "OAI-SearchBot", "Claude-SearchBot", "PerplexityBot"]) expect(rules).toContainEqual({ userAgent: bot, allow: "/", disallow: ["/api/"] });
  });
});
