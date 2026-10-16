import type { Metadata } from "next";
import { STEPS } from "./steps";

type SiteEnvironment = Record<string, string | undefined>;
const APPROVED_SITE_HOSTS = new Set(["sioona-site.vercel.app", "sioona-site.onrender.com"]);

function resolveOrigin(value: string, name: string, env: SiteEnvironment, approvedHosts: ReadonlySet<string> = new Set()): string {
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error(`${name} must be an absolute origin`); }
  const host = url.hostname.replace(/\.$/, "");
  const local = host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\./.test(host) || host === "0.0.0.0";
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || value.includes("?") || value.includes("#")) throw new Error(`${name} must contain only an origin`);
  const hostedPlatform = host === "vercel.app" || host.endsWith(".vercel.app") || host === "onrender.com" || host.endsWith(".onrender.com");
  if (production && (local || (hostedPlatform && !approvedHosts.has(url.hostname)))) throw new Error(`${name} must use a custom production domain or the approved canonical host`);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && !production)) throw new Error(`${name} must use HTTPS`);
  return url.origin;
}

export function resolveSiteUrl(env: SiteEnvironment = process.env): string {
  const configured = env.NEXT_PUBLIC_SITE_URL?.trim();
  const renderFallback = env.RENDER_EXTERNAL_URL?.trim();
  const value = configured || renderFallback;
  if (!value && (env.NODE_ENV === "production" || env.VERCEL_ENV === "production")) throw new Error("NEXT_PUBLIC_SITE_URL or RENDER_EXTERNAL_URL is required in production");
  return resolveOrigin(value || "http://localhost:3000", configured ? "NEXT_PUBLIC_SITE_URL" : "RENDER_EXTERNAL_URL", env, APPROVED_SITE_HOSTS);
}

export function resolveAppUrl(env: SiteEnvironment = process.env): string | null {
  const value = env.NEXT_PUBLIC_APP_URL?.trim();
  return value ? resolveOrigin(value, "NEXT_PUBLIC_APP_URL", env) : null;
}

export const productName = "Sioona Conversation Intelligence";
export const siteConfig = {
  name: "Sioona",
  tagline: "Signals Into Revenue",
  description: "Find churn risk, buying intent and upsell signals in customer chats. Review source evidence with your team in Sioona Shadow Mode before taking action.",
  // Direct references are required for Next's public environment substitution.
  url: resolveSiteUrl({ NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL, RENDER_EXTERNAL_URL: process.env.RENDER_EXTERNAL_URL }),
  appUrl: resolveAppUrl({ NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL }),
} as const;


export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Security", href: "/security" },
  { label: "Pricing", href: "/pricing" },
] as const;

export const routes = ["/", "/about", "/how-it-works", "/security", "/pricing", "/contact", "/developers", "/privacy", "/terms"] as const;

export type PublicRoute = (typeof routes)[number];

/** Search intent and metadata for the shared English pages serving India and the US. */
export const seoPages = {
  "/": {
    "title": "Conversation Intelligence for B2B Teams | Sioona",
    "description": "Find churn risk, buying intent and upsell signals in customer chats. Review source evidence with your team in Sioona Shadow Mode before taking action."
  },
  "/about": {
    "title": "About Sioona | Human-Led Conversation Intelligence",
    "description": "Meet Sioona: conversation intelligence for B2B teams. Discover how human review turns customer chats into evidence for retention, leads and upsell."
  },
  "/how-it-works": {
    "title": "Analyze Intercom & WhatsApp Chat Exports | Sioona",
    "description": "Analyze Intercom, WhatsApp and CSV chat exports for churn, lead and upsell signals. See how Sioona keeps human review at every step of the workflow."
  },
  "/security": {
    "title": "Conversation Intelligence & AI Review Safety | Sioona",
    "description": "Explore Sioona Shadow Mode, human review and chat data handling. Learn what to redact, what is stored and what to agree before sharing an export."
  },
  "/pricing": {
    "title": "Conversation Intelligence Pilot Pricing | Sioona",
    "description": "Evaluate Sioona in a two-week conversation intelligence pilot with one redacted chat export. Agree scope and pricing before your team starts reviewing."
  },
  "/contact": {
    "title": "Request a Conversation Intelligence Pilot | Sioona",
    "description": "Request a two-week Sioona Shadow Mode pilot. Discuss your chat export, review workflow and retention or upsell goals before agreeing scope and price."
  },
  "/developers": {
    "title": "Sioona Developer Resources | MCP & AI Search",
    "description": "Explore Sioona developer resources: a public read-only MCP server, Markdown pages and AI agent instructions for discovering conversation intelligence."
  },
  "/privacy": {
    "title": "Pilot Request Privacy & Contact Data | Sioona",
    "description": "Read how Sioona handles business contact details from pilot requests. Learn how to request access, correction or deletion and discuss export data terms."
  },
  "/terms": {
    "title": "Conversation Intelligence Pilot Terms | Sioona",
    "description": "Review Sioona pilot request terms, including business contact details, separately agreed scope and pricing, and human review of customer chat signals."
  }
} as const satisfies Record<PublicRoute, { title: string; description: string }>;

export function routeMetadata(path: PublicRoute): Metadata {
  const { title, description } = seoPages[path];
  return pageMetadata(title, description, path);
}

export function languageAlternates(path: string) {
  const canonical = new URL(path, siteConfig.url).toString();
  // One shared English document, without invented localized routes.
  return { "en-IN": canonical, "en-US": canonical, en: canonical, "x-default": canonical };
}

function areasServed() {
  return [{ "@type": "Country", name: "IN" }, { "@type": "Country", name: "US" }];
}

/** Organization facts for sitewide JSON-LD. Mumbai is the published operating location; no street address is published. */
export function organizationJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": `${origin}/#organization`,
    name: productName,
    alternateName: siteConfig.name,
    url: origin,
    description: siteConfig.description,
    areaServed: areasServed(),
    knowsAbout: ["Signal Intelligence", "Conversation Intelligence"],
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "sales",
      url: `${origin}/contact`,
      availableLanguage: "English",
    },
    address: {
      "@type": "PostalAddress",
      addressLocality: "Mumbai",
      addressRegion: "Maharashtra",
      addressCountry: "IN",
    },
  };
}

/** Site entity for the brand-plus-product name, on the canonical origin. */
export function websiteJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${origin}/#website`,
    name: productName,
    alternateName: siteConfig.name,
    url: origin,
    description: siteConfig.description,
    about: { "@id": `${origin}/#service` },
    publisher: {
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: productName,
      url: origin,
    },
  };
}

/** Conversation-intelligence offering. No list price is published; the pilot page is the offer. */
export function serviceJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Service",
    "@id": `${origin}/#service`,
    name: productName,
    serviceType: "Conversation intelligence",
    areaServed: areasServed(),
    description: siteConfig.description,
    url: `${origin}/`,
    provider: {
      "@type": "Organization",
      "@id": `${origin}/#organization`,
      name: productName,
      url: origin,
    },
    termsOfService: `${origin}/terms`,
    offers: {
      "@type": "Offer",
      name: "Sioona Shadow Mode pilot",
      url: `${origin}/pricing`,
      description: "Two-week pilot from one redacted chat export. Scope and price are agreed before the pilot starts. No public list price is published.",
    },
  };
}

/** Software product described on the homepage. No public list price is published. */
export function productJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Product",
    "@id": `${origin}/#product`,
    name: productName,
    description: siteConfig.description,
    category: "Conversation intelligence",
    url: `${origin}/`,
    manufacturer: { "@id": `${origin}/#organization` },
    subjectOf: { "@id": `${origin}/#review-workflow` },
    brand: {
      "@type": "Brand",
      name: siteConfig.name,
    },
  };
}

/** The four review steps shown in the homepage workflow. */
export function howToJsonLd(path = "/#how") {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${origin}/#review-workflow`,
    about: { "@id": `${origin}/#service` },
    publisher: { "@id": `${origin}/#organization` },
    isPartOf: { "@id": `${origin}/#website` },
    name: "Review customer chats with Sioona Conversation Intelligence",
    description: "Connect an export, detect lead, retention and upsell signals, review them with your team, then follow up in your own tools.",
    step: STEPS.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
      url: `${origin}${path}`,
    })),
  };
}

/** Breadcrumb trail for the current public page. */
export function breadcrumbJsonLd(items: readonly { name: string; path: string }[]) {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    "@id": `${new URL(items.at(-1)?.path ?? "/", `${origin}/`)}#breadcrumbs`,
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: new URL(item.path, `${origin}/`).toString(),
    })),
  };
}

export function jsonLdScript(data: unknown) {
  return JSON.stringify(data).replace(/</g, "\\u003c");
}

const NBSP = "\u00a0";

const NBSP_PHRASES = [
  "Signal Score",
  "Shadow Mode",
  "Suggested Next Action",
  "Why This Fired",
  "Request A Pilot",
  "Request a Pilot",
  "How It Works",
  "Needs Follow-up",
];

/** Keeps brand terms and number+unit pairs on one line. */
export function nb(text: string): string {
  let out = text;
  for (const phrase of NBSP_PHRASES) {
    out = out.split(phrase).join(phrase.split(" ").join(NBSP));
  }
  return out.replace(/(\d) (%|MB|GB|KB|days?|weeks?|reviews?|min)\b/g, `$1${NBSP}$2`);
}

export function pageMetadata(title: string, description: string, path: string): Metadata {
  const socialTitle = title;
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Sioona — conversation intelligence with human judgment" }];
  return {
    title: { absolute: title }, description,
    alternates: { canonical: new URL(path, siteConfig.url).toString(), languages: languageAlternates(path) },
    openGraph: { type: "website", siteName: siteConfig.name, locale: "en_US", alternateLocale: ["en_IN"], url: path, title: socialTitle, description, images },
    twitter: { card: "summary_large_image", title: socialTitle, description, images },
  };
}

/** Connected entity graph; page-specific breadcrumbs and HowTo remain next to their visible content. */
export function siteJsonLdGraph() {
  const origin = siteConfig.url.replace(/\/$/, "");
  const nodes = [organizationJsonLd(), websiteJsonLd(), serviceJsonLd()];
  return {
    "@context": "https://schema.org",
    "@graph": nodes.map(node => {
      const { "@context": context, ...entity } = node;
      void context;
      if (entity["@type"] === "WebSite") return { ...entity, publisher: { "@id": `${origin}/#organization` } };
      if (entity["@type"] === "Service") return { ...entity, provider: { "@id": `${origin}/#organization` } };
      return entity;
    }),
  };
}
