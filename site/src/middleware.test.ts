import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { siteConfig } from "@/lib/site";
import { config, middleware } from "./middleware";

function responseFor(pathname: string, accept: string) {
  return middleware(new NextRequest(new URL(pathname, "https://sioona-site.vercel.app"), { headers: { accept } }));
}

describe("markdown middleware", () => {
  const source = Array.isArray(config.matcher) ? config.matcher[0] : config.matcher;

  it("matches non-static routes and skips static assets", () => {
    expect(typeof source).toBe("string");
    const pattern = new RegExp(`^${source}$`);
    expect(source).toContain("_next/static");
    expect(source).toContain("_next/image");
    expect(pattern.test("/about")).toBe(true);
    expect(pattern.test("/missing")).toBe(true);
    expect(pattern.test("/api/contact")).toBe(true);
    expect(pattern.test("/llms.txt")).toBe(true);
    expect(pattern.test("/sitemap.xml")).toBe(true);
    expect(pattern.test("/_next/static/chunks/main.js")).toBe(false);
    expect(pattern.test("/_next/image")).toBe(false);
    expect(pattern.test("/sioona-footer.svg")).toBe(false);
    expect(pattern.test("/favicon.ico")).toBe(false);
  });

  it("sets Vary: Accept on HTML and Markdown responses", async () => {
    const html = responseFor("/about", "text/html");
    expect(html.headers.get("vary")).toBe("Accept");
    expect(html.status).toBe(200);

    const page = responseFor("/about", "text/markdown");
    expect(page.status).toBe(200);
    expect(page.headers.get("vary")).toBe("Accept");
    expect(page.headers.get("content-type")).toContain("text/markdown");
    expect(await page.text()).toContain("# About");

    const missing = responseFor("/not-a-page", "text/markdown");
    expect(missing.status).toBe(404);
    expect(missing.headers.get("vary")).toBe("Accept");
    expect(missing.headers.get("content-type")).toContain("text/markdown");
    const body = await missing.text();
    expect(body).toContain("/sitemap.xml");
    expect(body).toContain("/llms.txt");
    expect(body).toContain(`](${new URL("/", siteConfig.url).toString()})`);
  });
});
