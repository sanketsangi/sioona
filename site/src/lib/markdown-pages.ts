import { developerDescription, developerResources, developerSections } from "@/lib/developer-copy";
import { agentGuidance } from "@/lib/agent-guidance";
import { prefersMarkdown } from "@/lib/content-negotiation";
import { aboutParagraphs } from "@/lib/about";
import { faqItems } from "@/lib/faq";
import { routes, siteConfig } from "@/lib/site";

import { marketingCopy } from "@/lib/marketing-copy";
import { dataFacts, pilotFacts, privacyParagraphs, termsParagraphs } from "@/lib/public-facts";
import { contactPolicyText } from "@/lib/contact-policy";
import { STEPS } from "@/lib/steps";

const titles: Record<string, string> = {
  "/": "Sioona Conversation Intelligence", "/about": "About", "/how-it-works": "How it works",
  "/security": "Security", "/pricing": "Pilot offer", "/contact": "Request a pilot",
  "/developers": "Sioona developer resources", "/privacy": "Pilot request privacy notice", "/terms": "Pilot request terms",
};
function copy(...groups: (keyof typeof marketingCopy)[]) {
  return groups.flatMap<{ kind: string; text: string }>(group => marketingCopy[group]).map(row => `${row.kind === "heading" ? "## " : row.kind === "item" ? "- " : ""}${row.text}`).join("\n\n");
}
const pilot = () => `## Pilot scope and evidence\n\n${Object.values(pilotFacts).join("\n\n")}`;
const policy = () => contactPolicyText().join("\n\n");
const data = () => `## Data facts before you share\n\n${dataFacts.map(([title, text]) => `### ${title}\n\n${text}`).join("\n\n")}\n\n${policy()}`;
function bodyFor(path: string): string {
  switch (path) {
    case "/": return [copy("hero", "trust", "signals", "shadow", "score", "features", "securityBand"), pilot(), `## Frequently asked questions\n\n${faqItems.map(item => `### ${item.question}\n\n${item.answer}`).join("\n\n")}`, copy("finalCta")].join("\n\n");
    case "/about": return aboutParagraphs.join("\n\n");
    case "/how-it-works": return [copy("workflow"), STEPS.map(step => `### ${step.title}\n\n${step.body}`).join("\n\n"), pilot(), copy("finalCta")].join("\n\n");
    case "/security": return [copy("security", "securityBand"), data(), copy("finalCta")].join("\n\n");
    case "/pricing": return [copy("pricing"), pilot(), data()].join("\n\n");
    case "/contact": return [copy("contact"), policy()].join("\n\n");
    case "/privacy": return [privacyParagraphs.join("\n\n"), policy()].join("\n\n");
    case "/terms": return termsParagraphs.join("\n\n");
    case "/developers": return [developerDescription, "## Sioona public index", developerResources.map(resource => `[${resource.label}](${absoluteUrl(resource.href === "/mcp" ? "/developers#developers-mcp-title" : resource.href)}) — ${resource.note}`).join("\n\n"), ...developerSections.map(section => `## ${section.title}\n\n${section.paragraphs.join("\n\n")}`)].join("\n\n");
    default: return "";
  }
}

const passThroughPaths = new Set([
  "/indexnow-key.txt",
  "/llms.txt",
  "/mcp",
  "/.well-known/mcp",
  "/sitemap.xml",
  "/robots.txt",
  "/opengraph-image",
  "/icon.svg",
  "/apple-icon",
  "/favicon.ico",
]);

export function normalizePathname(pathname: string): string {
  const path = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (path === "/") return "/";
  return path.replace(/\/+$/, "");
}

export function markdownFor(pathname: string): string | null {
  const path = normalizePathname(pathname);
  const title = titles[path];
  if (!title) return null;
  const url = new URL(normalizePathname(pathname), siteConfig.url).toString();
  return `# ${title.includes("Sioona") ? title : `Sioona — ${title}`}\n\n${bodyFor(path).replace(/^(#{2,3}) (?!Sioona)(.+)$/gm, "$1 Sioona: $2")}\n\n${agentGuidance()}\n\n## Sioona navigation\n\n${routes.map(path => `[${titles[path]}](${absoluteUrl(path)})`).join(" · ")}\n\n[Agent instructions](${absoluteUrl("/llms.txt")})\n\nCanonical: ${url}\n`;
}

function absoluteUrl(path: string): string {
  return new URL(path, siteConfig.url).toString();
}

/** Public pages the docs MCP can list and filter. */
export function pageCatalog() {
  return routes.map((path) => ({
    path,
    title: titles[path],
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
