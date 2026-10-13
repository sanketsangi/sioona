/** Read-only smoke checks against a locally served production build. */
import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3101");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname), "Use a local preview URL");
const pages = ["/", "/how-it-works", "/security", "/pricing", "/contact", "/privacy", "/terms"];
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
  for (const [attribute, key] of [["property", "og:title"], ["property", "og:description"], ["name", "twitter:title"], ["name", "twitter:description"]]) {
    assert.match(html, new RegExp(`${attribute}="${key}" content="[^"]+"`), `${path}: social metadata`);
  }
  const meta = (key) => html.match(new RegExp(`(?:name|property)="${key}" content="([^"]+)"`))?.[1];
  assert.equal(meta("twitter:title"), meta("og:title"), `${path}: social titles agree`);
  assert.equal(meta("twitter:description"), meta("description"), `${path}: page-specific Twitter description`);
  assert.equal(meta("og:description"), meta("description"), `${path}: page-specific OpenGraph description`);
  assert.match(html, /property="og:image" content="https:\/\//, `${path}: social image`);
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
assert(home.includes("Play Demo Animation") && home.includes('data-demo-running="false"'), "Demo starts paused and exposes its play control");
const assets = new Set([...home.matchAll(/(?:src|href)="([^"\s]+)"/g)].map(match => match[1]).filter(url => url.startsWith("/_next/static/") || url.endsWith(".svg")));
for (const asset of assets) assert.equal((await fetch(new URL(asset, base))).status, 200, asset);
for (const [path, type] of [["/robots.txt","text/plain"],["/sitemap.xml","application/xml"],["/opengraph-image","image/png"],["/icon.svg","image/svg+xml"]]) {
  const response = await fetch(new URL(path, base)); assert.equal(response.status,200,path); assert(response.headers.get("content-type")?.includes(type),path);
  if (path === "/robots.txt") assert.match(await response.text(), /Sitemap: https:\/\//);
  if (path === "/sitemap.xml") {
    const sitemap = await response.text();
    const listed = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(match => new URL(match[1]).pathname);
    assert.deepEqual(listed.sort(), [...pages].sort(), "Sitemap lists every marketing route exactly once");
  }
}
assert.equal((await fetch(new URL("/missing-page-smoke-test", base))).status,404);
console.log(`PASS internal anchors, structured data, user-controlled demo, ${assets.size} assets, crawl files, social image, 404`);
