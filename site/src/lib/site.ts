const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;

export const siteConfig = {
  name: "Sioona",
  tagline: "Signals Into Revenue",
  description:
    "Sioona overlays conversation intelligence on your existing customer chats. It finds lead, retention and upsell signals, and humans review every one in Shadow\u00a0Mode before anything is acted on.",
  url:
    process.env.NEXT_PUBLIC_SITE_URL ??
    (vercelHost ? `https://${vercelHost}` : "http://localhost:3000"),
  appUrl: process.env.NEXT_PUBLIC_APP_URL || "/contact",
} as const;

/** The contact route is a stub: it validates and returns success, nothing is stored or sent. */
export const contactStub = true;

export const navLinks = [
  { label: "Product", href: "/#product" },
  { label: "How It Works", href: "/how-it-works" },
  { label: "Security", href: "/security" },
  { label: "Pricing", href: "/pricing" },
] as const;

export const routes = ["/", "/how-it-works", "/security", "/pricing", "/contact"] as const;

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
