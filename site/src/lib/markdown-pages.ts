import { siteConfig } from "@/lib/site";

const pages: Record<string, { title: string; body: string }> = {
  "/": {
    title: "Sioona",
    body: "Find lead, retention and upsell signals in customer chats. Review source evidence, measure precision, and keep every action in human hands.",
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
    body: "A pilot uses one redacted chat export for two weeks. Scope and price are agreed before it starts, then your team makes a go or no-go decision from the Signal Score.",
  },
  "/contact": {
    title: "Request a pilot",
    body: "Request a two-week Shadow Mode pilot. Supported exports are Intercom JSON, WhatsApp Business text, and CSV or JSON. The form stores a business contact request and returns a receipt.",
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

export function markdownFor(pathname: string): string | null {
  const page = pages[pathname];
  if (!page) return null;
  const url = new URL(pathname, siteConfig.url).toString();
  return `# ${page.title}\n\n${page.body}\n\nCanonical: ${url}\n`;
}
