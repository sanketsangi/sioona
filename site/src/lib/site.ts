import type { Metadata } from "next";

const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const siteConfig = {
  name: "Sioona",
  tagline: "Signals Into Revenue",
  description:
    "Sioona Conversation Intelligence works with your existing customer chats. It finds lead, retention and upsell signals, and humans review every one in Shadow\u00a0Mode before anything is acted on.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (vercelHost ? `https://${vercelHost}` : "https://sioona-site.vercel.app"),
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || null,
} as const;


export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Security", href: "/security" },
  { label: "Pricing", href: "/pricing" },
] as const;

export const routes = ["/", "/about", "/how-it-works", "/security", "/pricing", "/contact", "/privacy", "/terms"] as const;

/** Organization facts for sitewide JSON-LD. Mumbai is the published operating location; no street address is published. */
export function organizationJsonLd() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: "Sioona Conversation Intelligence",
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
  const socialTitle = `${title} | Sioona`;
  const images = [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Sioona — conversation intelligence with human judgment" }];
  return {
    title, description,
    alternates: { canonical: path },
    openGraph: { type: "website", siteName: siteConfig.name, locale: "en_US", url: path, title: socialTitle, description, images },
    twitter: { card: "summary_large_image", title: socialTitle, description, images },
  };
}
