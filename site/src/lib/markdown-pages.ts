import { agentGuidance } from "@/lib/agent-guidance";
import { prefersMarkdown } from "@/lib/content-negotiation";
import { aboutParagraphs } from "@/lib/about";
import { faqItems } from "@/lib/faq";
import { routes, siteConfig } from "@/lib/site";

const pages: Record<string, { title: string; body: string }> = {
  "/": {
    title: "Sioona Conversation Intelligence",
    body: `${aboutParagraphs.slice(0, 2).join("\n\n")}

## Sioona frequently asked questions

${faqItems.map(item => `### Sioona: ${item.question}\n\n${item.answer}`).join("\n\n")}`,

  },
  "/about": {
    title: "About",
    body: aboutParagraphs.join("\n\n"),
  },
  "/how-it-works": {
    title: "How it works",
    body: "Connect an export, detect lead, retention and upsell signals, review them with your team, then act. Shadow Mode means nothing is acted on without a human.",
  },
  "/security": {
    title: "Security",
    body: "Humans stay in the loop, each pilot is a single tenant, and Shadow Mode never sends outbound messages. Sensitive details are masked on ingest.",
  },
  "/pricing": {
    title: "Pilot offer",
    body: "A pilot uses one redacted chat export for two weeks. Scope and price are agreed before it starts; no public list price is available yet. The pilot includes Insights, uploads, evaluation and taxonomy tools, a Signal Score measured against your team’s review, and an agreed threshold for a go or no-go decision. Ongoing use, volume and procurement requirements are discussed separately after the results.",
  },
  "/contact": {
    title: "Request a pilot",
    body: "Request a two-week Shadow Mode pilot. Supported exports are Intercom JSON, WhatsApp Business text, and CSV or JSON. The form stores a business contact request and returns a receipt.",
  },
  "/developers": {
    title: "Sioona developer resources",
    body: `Public read-only resources for agents. Sioona does not publish a customer-data API, SDK, or OpenAPI spec for product actions.

## Sioona MCP server

The discovery manifest is ${absoluteUrl("/.well-known/mcp")}. The Streamable HTTP endpoint is ${absoluteUrl("/mcp")}. \`sioona_list_pages\` takes a required string \`query\` matched against public paths and titles; an empty query lists every page. \`sioona_read_page\` takes a required \`path\` from that list.

## Sioona Markdown pages

Fetch any public page with \`Accept: text/markdown\`. Start from ${absoluteUrl("/llms.txt")} and ${absoluteUrl("/developers")}.`,
  },
  "/privacy": {
    title: "Pilot request privacy notice",
    body: "The pilot form collects business contact details so Sioona can review the request and reply. Use the contact form to ask for access, correction, or deletion. Do not include customer transcripts or secrets.",
  },
  "/terms": {
    title: "Pilot request terms",
    body: "Submitting the form requests a discussion. It does not create a subscription. Scope, price, and data terms are agreed separately. People review signals, and Sioona does not message customers.",
  },
};

const passThroughPaths = new Set([
  "/llms.txt",
  "/mcp",
  "/.well-known/mcp",
  "/sitemap.xml",
  "/robots.txt",
  "/opengraph-image",
  "/icon.svg",
  "/favicon.ico",
]);

export function normalizePathname(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path === "/") return "/";
  return path.replace(/\/+$/, "");
}

export function markdownFor(pathname: string): string | null {
  const page = pages[normalizePathname(pathname)];
  if (!page) return null;
  const url = new URL(normalizePathname(pathname), siteConfig.url).toString();
  return `# ${page.title.includes("Sioona") ? page.title : `Sioona — ${page.title}`}\n\n${page.body}\n\n${agentGuidance()}\n\n## Sioona navigation\n\n${routes.map(path => `[${pages[path].title}](${absoluteUrl(path)})`).join(" · ")}\n\n[Agent instructions](${absoluteUrl("/llms.txt")})\n\nCanonical: ${url}\n`;
}

function absoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}

/** Public pages the docs MCP can list and filter. */
export function pageCatalog() {
  return routes.map((path) => ({
    path,
    title: pages[path].title,
    url: absoluteUrl(path),
  }));
}

/** Markdown 404 that points agents at the home page, sitemap, and llms.txt. */
export function markdownNotFound(pathname: string): string {
  const path = normalizePathname(pathname).replace(/[`\u0000-\u001f\u007f]/g, "").slice(0, 200) || "/";
  return `# Page not found — Sioona

No public page exists at \`${path}\`.

## Continue with Sioona

- [Home](${absoluteUrl("/")})
- [Sitemap](${absoluteUrl("/sitemap.xml")})
- [llms.txt](${absoluteUrl("/llms.txt")})
`;
}

export function isMarkdownPassThrough(pathname: string): boolean {
  const path = normalizePathname(pathname);
  if (path === "/api" || path.startsWith("/api/")) return true;
  if (path.startsWith("/_next/")) return true;
  return passThroughPaths.has(path);
}

/** Markdown body for a request, or null when the HTML route should render. */
export function markdownDocument(
  pathname: string,
  accept: string | null,
): { status: 200 | 404; body: string } | null {
  if (!prefersMarkdown(accept)) return null;
  const path = normalizePathname(pathname);
  if (isMarkdownPassThrough(path)) return null;
  const body = markdownFor(path);
  if (body) return { status: 200, body };
  return { status: 404, body: markdownNotFound(path) };
}
