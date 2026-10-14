/** Read-only smoke checks against a locally served production build. */
import assert from "node:assert/strict";
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3101");
assert(["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) || (process.argv.includes("--production") && base.origin === "https://sioona-site.vercel.app"), "Use a local preview URL or the explicit --production target");
const pages = ["/", "/about", "/how-it-works", "/security", "/pricing", "/contact", "/privacy", "/terms"];
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
    if (url.hash && url.hash !== "#top") assert(htmlByPath.get(url.pathname).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `Broken link ${path} → ${url.pathname}${url.hash}`);
  }
}
const home = htmlByPath.get("/");
assert.match(home, /property="og:title"/); assert.match(home, /property="og:image"/);
assert.match(home, /name="twitter:card" content="summary_large_image"/);
const schemas = [...home.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(match => JSON.parse(match[1]));
assert(schemas.some(data => data["@type"] === "SoftwareApplication"));
assert.equal(schemas.find(data => data["@type"] === "FAQPage")?.mainEntity.length, 7);
assert(/(?:Play|Pause) Demo Animation/.test(home) && /data-demo-running="(?:true|false)"/.test(home), "Demo exposes its playback control and running state");
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

for (const path of [...pages, "/agentic-missing-page"]) {
  const html = await fetch(new URL(path, base), { headers: { Accept: "text/html" } });
  const markdown = await fetch(new URL(path, base), { headers: { Accept: "text/markdown" } });
  const missing = path === "/agentic-missing-page";
  assert.equal(html.status, missing ? 404 : 200, path);
  assert.equal(markdown.status, missing ? 404 : 200, path);
  assert.match(markdown.headers.get("content-type") ?? "", /text\/markdown/, path);
  for (const response of [html, markdown]) assert(response.headers.get("vary")?.toLowerCase().split(/,\s*/).includes("accept"), `${path}: Vary includes Accept`);
  const body = await markdown.text();
  if (missing) for (const link of ["/sitemap.xml", "/llms.txt"]) assert(body.includes(link));
  if (path === "/about") assert(body.length >= 500);
  console.log(`PASS ${path}: HTML/Markdown negotiation, status and Vary`);
}
const organization = schemas.find(data => data["@type"] === "Organization");
assert(organization?.contactPoint?.url && organization?.address?.addressCountry, "Organization contact and location");
assert(home.includes('name="is-agentic-site-type" content="business"'));
const instructions = await fetch(new URL("/llms.txt", base));
assert((await instructions.text()).includes("## When to use Sioona"));
const discovery = await fetch(new URL("/.well-known/mcp", base), { headers: { Accept: "text/markdown" } });
assert.equal(discovery.status, 200);
assert.match(discovery.headers.get("content-type"), /application\/json/);
const card = await discovery.json();
assert(card.remotes.some(remote => remote.type === "streamable-http" && new URL(remote.url).pathname === "/mcp"));
const call = async (method, params) => {
  const response = await fetch(new URL("/mcp", base), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
  assert.equal(response.status, 200, method);
  assert(response.headers.get("vary")?.toLowerCase().split(/,\s*/).includes("accept"));
  return (await response.json()).result;
};
assert.equal((await call("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "production-smoke", version: "1" } })).serverInfo.name, "sioona-public-content");
assert.equal((await call("tools/list")).tools.length, 2);
assert((await call("tools/call", { name: "sioona_read_page", arguments: { path: "/about" } })).content[0].text.length >= 500);
for (const path of ["/llms.txt", "/robots.txt", "/sitemap.xml", "/.well-known/mcp", "/mcp", "/api/contact"]) {
  const response = await fetch(new URL(path, base));
  assert(response.headers.get("vary")?.toLowerCase().split(/,\s*/).includes("accept"), `${path}: native route Vary`);
}
console.log("PASS business declaration, Organization, agent instructions, MCP discovery + live handshake + public tool calls");

const notification = await fetch(new URL("/mcp", base), { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream", Origin: "https://is-agentic.com", "MCP-Protocol-Version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) });
assert.equal(notification.status, 202);
assert.equal(await notification.text(), "");
assert.equal(notification.headers.get("access-control-allow-origin"), "https://is-agentic.com");
const preflight = await fetch(new URL("/mcp", base), { method: "OPTIONS", headers: { Origin: "https://is-agentic.com", "Access-Control-Request-Method": "POST", "Access-Control-Request-Headers": "content-type,mcp-protocol-version" } });
assert.equal(preflight.status, 204);
assert.match(preflight.headers.get("access-control-allow-headers"), /MCP-Protocol-Version/i);
for (const schema of schemas.filter(data => ["Organization", "SoftwareApplication"].includes(data["@type"]))) assert.equal(schema.name, "Sioona Conversation Intelligence");
assert.match(home, /<title>Sioona Conversation Intelligence/);
assert.match(home, /<h1[^>]*>Sioona Conversation Intelligence/);
assert((await (await fetch(base, { headers: { Accept: "text/markdown" } })).text()).includes("# Sioona Conversation Intelligence"));
console.log("PASS Sioona branding, initialized notification, scanner CORS and preflight");
