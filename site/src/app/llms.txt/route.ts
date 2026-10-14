import { agentGuidance } from "@/lib/agent-guidance";
import { siteConfig } from "@/lib/site";

export function GET() {
  const origin = siteConfig.url.replace(/\/$/, "");
  const body = `# Sioona Conversation Intelligence

${siteConfig.description}

Sioona finds lead, retention and upsell signals in the customer chats a team already has. Reviewers see the source words, record whether each signal is correct, and use Signal Score as the pilot go or no-go measure. Shadow Mode does not send messages to customers.

Supported exports: Intercom JSON, WhatsApp Business text exports, and CSV or JSON files. A pilot starts from one redacted export. No mailbox access, chat-tool API keys, or CRM credentials are required.

## Sioona pages

- [Home](${origin}/): product overview
- [About](${origin}/about): who Sioona is, how Shadow Mode works, and what a pilot includes
- [How it works](${origin}/how-it-works): connect, detect, review, act
- [Security](${origin}/security): human review, tenant isolation, no outbound messaging
- [Pricing](${origin}/pricing): two-week pilot, scope agreed before start
- [Request a pilot](${origin}/contact): business contact form with a stored receipt
- [Privacy](${origin}/privacy): how pilot-request contact details are used
- [Terms](${origin}/terms): what submitting a pilot request does and does not create
- [Sitemap](${origin}/sitemap.xml): every public URL

${agentGuidance()}
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      vary: "Accept",
    },
  });
}
