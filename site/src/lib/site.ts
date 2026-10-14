import type { Metadata } from "next";
import { STEPS } from "./steps";

type SiteEnvironment = Record<string, string | undefined>;
const APPROVED_VERCEL_SITE_HOST = "sioona-site.vercel.app";

function resolveOrigin(value: string, name: string, env: SiteEnvironment, approvedVercelHost?: string): string {
  const production = env.NODE_ENV === "production" || env.VERCEL_ENV === "production";
  let url: URL;
  try { url = new URL(value.trim()); } catch { throw new Error(`${name} must be an absolute origin`); }
  const host = url.hostname.replace(/\.$/, "");
  const local = host === "localhost" || host.endsWith(".localhost") || host === "[::1]" || /^127\./.test(host) || host === "0.0.0.0";
  if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || value.includes("?") || value.includes("#")) throw new Error(`${name} must contain only an origin`);
  const approvedVercelSiteHost = url.hostname === approvedVercelHost;
  const unapprovedVercelHost = (host === "vercel.app" || host.endsWith(".vercel.app")) && !approvedVercelSiteHost;
  if (production && (local || unapprovedVercelHost)) throw new Error(`${name} must use a custom production domain or the approved canonical host`);
  if (url.protocol !== "https:" && !(url.protocol === "http:" && local && !production)) throw new Error(`${name} must use HTTPS`);
  return url.origin;
}

export function resolveSiteUrl(env: SiteEnvironment = process.env): string {
  const value = env.NEXT_PUBLIC_SITE_URL?.trim();
  if (!value && (env.NODE_ENV === "production" || env.VERCEL_ENV === "production")) throw new Error("NEXT_PUBLIC_SITE_URL is required in production");
  return resolveOrigin(value || "http://localhost:3000", "NEXT_PUBLIC_SITE_URL", env, APPROVED_VERCEL_SITE_HOST);
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
  url: resolveSiteUrl({ NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL }),
  appUrl: resolveAppUrl({ NODE_ENV: process.env.NODE_ENV, VERCEL_ENV: process.env.VERCEL_ENV, NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL }),
} as const;


export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Security", href: "/security" },
  { label: "Pricing", href: "/pricing" },
] as const;

export const routes = ["/", "/about", "/how-it-works", "/security", "/pricing", "/contact", "/developers", "/privacy", "/terms"] as const;

/** Organization facts for sitewide JSON-LD. Mumbai is the published operating location; no street address is published. */
export function organizationJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: productName,
    alternateName: siteConfig.name,
    url: origin,
    description: siteConfig.description,
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
    name: productName,
    alternateName: siteConfig.name,
    url: origin,
    description: siteConfig.description,
    publisher: {
      "@type": "Organization",
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
    name: productName,
    serviceType: "Conversation intelligence",
    description: siteConfig.description,
    url: `${origin}/`,
    provider: {
      "@type": "Organization",
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
    name: productName,
    description: siteConfig.description,
    category: "Conversation intelligence",
    url: `${origin}/`,
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
  const socialTitle = `${title} | ${productName}`;
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Sioona — conversation intelligence with human judgment" }];
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: siteConfig.name, locale: "en_US", url: path, title: socialTitle, description, images },
    twitter: { card: "summary_large_image", title: socialTitle, description, images },
  };
}
