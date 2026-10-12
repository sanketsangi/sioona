/** Read-only smoke checks against a locally served production build. */
import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3101");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Use a local preview URL");
const pages = ["/", "/how-it-works", "/security", "/pricing", "/contact"];
const htmlByPath = new Map();
for (const path of pages) {
  const response = await fetch(new URL(path, base));
  assert.equal(response.status, 200, path);
  const html = await response.text(); htmlByPath.set(path, html);
  assert.equal((html.match(/<h1\b/g) ?? []).length, 1, `${path}: one h1`);
  assert.equal((html.match(/<main\b/g) ?? []).length, 1, `${path}: one main`);
  for (const pattern of [/<title>[^<]+<\/title>/, /name="description" content="[^"]+"/, /rel="canonical" href="https:\/\/[^"\s]+"/]) {
    assert.match(html, pattern, `${path}: SEO metadata`);
  }
  console.log(`PASS ${path}: HTTP, landmarks, title, description, canonical`);
}
for (const [path, html] of htmlByPath) {
  for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll("&amp;", "&"), new URL(path, base));
    if (url.origin !== base.origin || !htmlByPath.has(url.pathname)) continue;
    if (url.hash) assert(htmlByPath.get(url.pathname).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `Broken link ${path} → ${url.pathname}${url.hash}`);
  }
}
const home = htmlByPath.get("/");
assert.match(home, /property="og:title"/); assert.match(home, /property="og:image"/);
assert.match(home, /name="twitter:card" content="summary_large_image"/);
const schemas = [...home.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
assert(schemas.some(data => data["@type"] === "SoftwareApplication"));
assert.equal(schemas.find(data => data["@type"] === "FAQPage")?.mainEntity.length, 7);
assert(home.includes("Pause Demo Animation") && home.includes('data-demo-running="false"'), "Demo waits for scroll entry and exposes its pause control");
const assets = new Set([...home.matchAll(/(?:src|href)="([^"\s]+)"/g)].map(match => match[1]).filter(url => url.startsWith("/_next/static/") || url.endsWith(".svg")));
for (const asset of assets) assert.equal((await fetch(new URL(asset, base))).status, 200, asset);
for (const [path, type] of [["/robots.txt","text/plain"],["/sitemap.xml","application/xml"],["/opengraph-image","image/png"],["/icon.svg","image/svg+xml"]]) {
  const response = await fetch(new URL(path, base)); assert.equal(response.status,200,path); assert(response.headers.get("content-type")?.includes(type),path);
  if (path === "/robots.txt") assert.match(await response.text(), /Sitemap: https:\/\//);
  if (path === "/sitemap.xml") assert.equal(((await response.text()).match(/<url>/g) ?? []).length, 5);
}
assert.equal((await fetch(new URL("/missing-page-smoke-test", base))).status,404);
console.log(`PASS internal anchors, structured data, scroll-triggered demo, ${assets.size} assets, crawl files, social image, 404`);
