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
  description: "Sioona Conversation Intelligence works with your existing customer chats. It finds lead, retention and upsell signals, and humans review every one in Shadow\u00a0Mode before anything is acted on.",
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

/** Final page titles bypass the layout template to preserve their search length. */
export const routeSeo = {
  "/": {
    title: "Sioona Conversation Intelligence for B2B Teams",
    description: "Find churn, retention and buying signals in B2B customer chats. Review source evidence with humans in Shadow Mode before your team follows up.",
    label: "Conversation intelligence",
  },
  "/about": {
    title: "About Sioona | Human-Led Conversation Intelligence",
    description: "Learn how Sioona helps B2B teams review churn, retention and upsell signals from customer chats, with source evidence and human-led Shadow Mode.",
    label: "About Sioona",
  },
  "/how-it-works": {
    title: "How Sioona Detects Churn Signals | Shadow Mode",
    description: "Upload chat exports, detect churn and retention signals, then review source evidence in Shadow Mode. Humans decide every follow-up in their own tools.",
    label: "How Shadow Mode works",
  },
  "/security": {
    title: "Conversation Intelligence Security | Sioona",
    description: "Review Sioona data handling, tenant isolation controls and security questions for B2B chat analysis. Shadow Mode keeps customer follow-up with humans.",
    label: "Security and data handling",
  },
  "/pricing": {
    title: "Conversation Intelligence Pilot & Pricing | Sioona",
    description: "Explore a two-week B2B conversation intelligence pilot for churn and retention review. Scope and pricing are agreed before start; no list price is published.",
    label: "Pilot scope and pricing",
  },
  "/contact": {
    title: "Request a B2B Conversation Intelligence Pilot",
    description: "Discuss a Sioona Shadow Mode pilot for churn and retention signals in B2B chats. Share business contact details first, without customer transcripts.",
    label: "Request a pilot",
  },
  "/developers": {
    title: "Sioona Developer Resources | MCP & AI Search",
    description: "Read first-party conversation intelligence facts through Sioona MCP, Markdown pages and agent instructions. Public endpoints do not accept customer chats.",
    label: "Developer resources",
  },
  "/privacy": {
    title: "Pilot Privacy & Chat Data Boundaries | Sioona",
    description: "Learn how Sioona uses pilot enquiry details for B2B conversation intelligence. Agree separate chat-data retention and processing terms before sharing exports.",
    label: "Pilot request privacy",
  },
  "/terms": {
    title: "Shadow Mode Pilot Request Terms | Sioona",
    description: "Read terms for a B2B conversation intelligence pilot enquiry. Scope, price and chat-data terms are agreed separately; humans review signals in Shadow Mode.",
    label: "Pilot request terms",
  },
} as const satisfies Record<PublicRoute, { title: string; description: string; label: string }>;

export function routeMetadata(path: PublicRoute): Metadata {
  const { title, description } = routeSeo[path];
  return pageMetadata(title, description, path);
}

/** One shared English page serves these audiences; no locale-specific copies exist. */
export function internationalAlternates(path: string) {
  const url = new URL(path, siteConfig.url).toString();
  return { canonical: url, languages: { "en-IN": url, "en-US": url, en: url, "x-default": url } };
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
export function howToJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "HowTo",
    "@id": `${origin}/#review-workflow`,
    about: { "@id": `${origin}/#product` },
    publisher: { "@id": `${origin}/#organization` },
    isPartOf: { "@id": `${origin}/#website` },
    name: "Review customer chats with Sioona Conversation Intelligence",
    description: "Connect an export, detect lead, retention and upsell signals, review them with your team, then follow up in your own tools.",
    step: STEPS.map((step, index) => ({
      "@type": "HowToStep",
      position: index + 1,
      name: step.title,
      text: step.body,
      url: `${origin}/#how`,
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
    alternates: internationalAlternates(path),
    openGraph: { type: "website", siteName: siteConfig.name, locale: "en_US", alternateLocale: ["en_IN"], url: path, title: socialTitle, description, images },
    twitter: { card: "summary_large_image", title: socialTitle, description, images },
  };
}
