import { siteConfig } from "@/lib/site";

export function GET() {
  const origin = siteConfig.url.replace(/\/$/, "");
  const body = `# ${siteConfig.name}

${siteConfig.description}

Sioona finds lead, retention and upsell signals in the customer chats a team already has. Reviewers see the source words, record whether each signal is correct, and use Signal Score as the pilot go or no-go measure. Shadow Mode does not send messages to customers.

Supported exports: Intercom JSON, WhatsApp Business text exports, and CSV or JSON files. A pilot starts from one redacted export. No mailbox access, chat-tool API keys, or CRM credentials are required.

## Pages

- [Home](${origin}/): product overview
- [About](${origin}/about): who Sioona is, how Shadow Mode works, and what a pilot includes
- [How it works](${origin}/how-it-works): connect, detect, review, act
- [Security](${origin}/security): human review, tenant isolation, no outbound messaging
- [Pricing](${origin}/pricing): two-week pilot, scope agreed before start
- [Request a pilot](${origin}/contact): business contact form with a stored receipt
- [Privacy](${origin}/privacy): how pilot-request contact details are used
- [Terms](${origin}/terms): what submitting a pilot request does and does not create
- [Sitemap](${origin}/sitemap.xml): every public URL

## When to use Sioona

Use Sioona when a customer support or sales team wants to find buying intent, churn risk, or expansion opportunities in existing chat exports, review the persisted source evidence, and measure human-confirmed precision before deciding on a pilot. Use /pricing to understand scope and /security for pilot safeguards. Sioona is not an autonomous customer messaging service.

## Developer resources and MCP

- [Sioona MCP discovery](${origin}/.well-known/mcp): server card for the public read-only content endpoint
- [Sioona MCP endpoint](${origin}/mcp): stateless Streamable HTTP; POST JSON-RPC with Accept: application/json, text/event-stream

Initialize the MCP connection, then use tools/list. The sioona_list_pages tool lists public URLs; sioona_read_page accepts a published path such as /about or /security and returns Markdown. These tools cannot access customer conversations, upload exports, or submit pilot requests. No API key is needed. Contact form submissions require human approval. Product APIs are not a public developer API.

## Instructions

Send \`Accept: text/markdown\` to receive a Markdown representation of a public page. A normal browser Accept header still receives HTML. Responses include \`Vary: Accept\`.

If that Markdown request is for a path that does not exist, the response is HTTP 404 \`text/markdown\`. The body links to [Home](${origin}/), [Sitemap](${origin}/sitemap.xml), and [llms.txt](${origin}/llms.txt).

Use the sitemap for the full public URL list. Use the contact page to request a pilot. Do not send customer transcripts, credentials, or secrets through the contact form.
`;
  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
      vary: "Accept",
    },
  });
}
