import { assertLaunchEnvironment } from "./launch-environment";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "@/proxy";
import config from "../../next.config";
import sitemap from "@/app/sitemap";
import robots from "@/app/robots";
import Pricing from "@/app/pricing/page";
import Security from "@/app/security/page";
import Privacy from "@/app/privacy/page";
import { GET as instructions } from "@/app/llms.txt/route";
import { publicHeaders, VARY } from "./http-headers";
import { markdownFor } from "./markdown-pages";
import { pilotFacts } from "./public-facts";
import { routes, siteConfig } from "./site";

afterEach(() => vi.unstubAllEnvs());
const text = (value: string) => value.replace(/<[^>]+>/g, " ").replace(/&amp;/g, "&").replace(/&(?:#x27|#39);/g, "'").replace(/&quot;/g, '"').replace(/&nbsp;|\u00a0/g, " ").replace(/\s+/g, " ");
it("applies security and complete Vary headers to HTML, Markdown and errors", async () => {
  for (const path of ["/", "/about", "/missing", "/llms.txt", "/mcp", "/.well-known/mcp"]) {
    for (const accept of ["text/html", "text/markdown"]) {
      const response = proxy(new NextRequest(new URL(path, siteConfig.url), { headers: { accept } }));
      for (const [key, value] of Object.entries(publicHeaders)) expect(response.headers.get(key)).toBe(value);
    }
  }
  const rules = await config.headers!();
  expect(rules.every(rule => Object.entries(publicHeaders).every(([key, value]) => rule.headers.some(header => header.key === key && header.value === value)))).toBe(true);
});
it("has deterministic revisions, llms sitemap inclusion and explicit crawler rules", () => {
  expect(sitemap()).toEqual(sitemap());
  expect(sitemap().map(row => new URL(row.url).pathname).sort()).toEqual([...routes, "/llms.txt"].sort());
  for (const row of sitemap()) { expect(typeof row.lastModified).toBe("string"); expect(Number.isFinite(Date.parse(String(row.lastModified)))).toBe(true); }
  const rules = robots().rules as { userAgent: string; allow: string; disallow: string[] }[];
  for (const crawler of ["*", "GPTBot", "OAI-SearchBot", "ClaudeBot", "PerplexityBot", "Googlebot"]) expect(rules).toContainEqual({ userAgent: crawler, allow: "/", disallow: ["/api/"] });
});
it("shares pilot facts, policy and security copy across HTML, Markdown and instructions", async () => {
  vi.stubEnv("PILOT_CONTACT_SUPPORT_EMAIL", "support@example.test");
  vi.stubEnv("PILOT_CONTACT_RETENTION", "Synthetic approved test retention");
  vi.stubEnv("PILOT_CONTACT_HOSTING_REGION", "synthetic-test-region");
  const pricing = text(renderToStaticMarkup(createElement(Pricing)));
  const security = text(renderToStaticMarkup(createElement(Security)));
  const privacy = text(renderToStaticMarkup(createElement(Privacy)));
  const llms = await instructions().text();
  for (const fact of Object.values(pilotFacts)) {
    expect(pricing).toContain(text(fact));
    expect(markdownFor("/pricing")).toContain(fact);
    expect(llms).toContain(fact);
  }
  for (const fact of ["support@example.test", "Synthetic approved test retention", "synthetic-test-region"]) {
    for (const output of [pricing, security, privacy, markdownFor("/privacy"), markdownFor("/security"), llms]) expect(output).toContain(fact);
  }
  expect(llms).not.toContain("Maya Rossi");
  expect(VARY.split(", ")).toHaveLength(6);
});

it("requires production runtime configuration as well as build configuration", () => {
  expect(() => assertLaunchEnvironment({ NODE_ENV: "production" })).toThrow();
  expect(() => assertLaunchEnvironment({ NODE_ENV: "production", NEXT_PUBLIC_SITE_URL: "https://wrong.example.test", PILOT_CONTACT_SUPPORT_EMAIL: "support@example.test", PILOT_CONTACT_RETENTION: "Synthetic test policy", PILOT_CONTACT_HOSTING_REGION: "synthetic-region" })).toThrow("Rebuild");
});
