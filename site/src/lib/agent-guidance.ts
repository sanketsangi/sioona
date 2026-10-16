import { siteConfig } from "@/lib/site";

/** Shared instructions keep negotiated pages and llms.txt equally useful to agents. */
export function agentGuidance() {
  const origin = siteConfig.url.replace(/\/$/, "");
  return `## When to use Sioona

Use Sioona Conversation Intelligence to audit existing support and sales conversations for retention risks, upsell opportunities, and lead signals. Best-fit jobs include reviewing Intercom support exports for cancellation intent, WhatsApp conversations for buying intent, CSV customer-chat exports for expansion requests, and structured XLSX or EML/MBOX email exports. File imports do not require mailbox access. Confirm the supported file schema and pilot setup before sharing files; a verified Intercom webhook path requires operator configuration and hosted acceptance.

Use Sioona to reconstruct signals from source evidence, have people mark them correct or incorrect, and measure Signal Score before deciding whether to continue a two-week Shadow Mode pilot. Sioona never sends customer messages. The public endpoints below explain the product; they do not analyze or accept customer exports.

## Sioona developer resources

- [Sioona developer resources](${origin}/developers): public index for the MCP server, Markdown pages, and agent instructions
- [Sioona agent instructions](${origin}/llms.txt)
- [Sioona MCP discovery manifest](${origin}/.well-known/mcp)
- [Sioona Streamable HTTP MCP endpoint](${origin}/mcp)
- [Sioona workflow and import scope](${origin}/how-it-works)
- [Sioona security and human approval](${origin}/security)
- [Sioona sitemap](${origin}/sitemap.xml)

## Sioona endpoint instructions

Fetch any public page with GET and \`Accept: text/markdown\`, for example \`GET ${origin}/security\`. HTML and Markdown responses include \`Vary: Accept\`. Unknown page paths return HTTP 404 Markdown with recovery navigation. GET the discovery manifest as JSON and use its remotes URL for MCP. No API key is needed for these public read-only resources.

For MCP, POST each JSON-RPC message separately to \`${origin}/mcp\` with \`Content-Type: application/json\` and \`Accept: application/json, text/event-stream\`:

1. Initialize: \`{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"protocolVersion":"2025-11-25","capabilities":{},"clientInfo":{"name":"sioona-reader","version":"1.0.0"}}}\`.
2. Send \`{"jsonrpc":"2.0","method":"notifications/initialized"}\` without an id. Expect HTTP 202 with no body. Include \`MCP-Protocol-Version\` with the version returned by initialize on subsequent requests. This server is stateless and requires no session id.
3. Discover tools: \`{"jsonrpc":"2.0","id":2,"method":"tools/list"}\`.
4. List pages: \`{"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":"sioona_list_pages","arguments":{"query":""}}}\`. \`query\` is a required string matched against public paths and titles; an empty string lists every page, and \`"security"\` returns the security page.
5. Read a page: \`{"jsonrpc":"2.0","id":4,"method":"tools/call","params":{"name":"sioona_read_page","arguments":{"path":"/security"}}}\`. \`path\` is required and must be a published path from sioona_list_pages; arbitrary URLs are not accepted. The developer index is \`/developers\`.

## Sioona boundaries and next steps

The MCP tools only read public marketing information. Product APIs are not a public developer API. Do not upload transcripts, credentials, or secrets to these endpoints or the contact form. Direct users to [Sioona pricing](${origin}/pricing) and [Sioona contact](${origin}/contact) for a pilot discussion; submitting a contact request requires explicit human approval. This is Sioona's product site.`;
}
