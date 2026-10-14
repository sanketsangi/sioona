import { publicHeaders, VARY } from "@/lib/http-headers";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { CallToolRequestSchema, ListToolsRequestSchema } from "@modelcontextprotocol/sdk/types.js";
import { readBoundedJson, RequestTooLarge } from "@/lib/bounded-json";
import { markdownFor, markdownNotFound, pageCatalog } from "@/lib/markdown-pages";
import { routes, siteConfig } from "@/lib/site";

export const runtime = "nodejs";

const annotations = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };

// Explicit origins preserve MCP DNS-rebinding protection while supporting the scanner.
function allowedOrigin(request: Request) {
  const origin = request.headers.get("origin");
  return !origin || [new URL(request.url).origin, new URL(siteConfig.url).origin, "https://is-agentic.com"].includes(origin);
}

function transportHeaders(request?: Request) {
  const headers = new Headers({
    ...publicHeaders,
    Vary: VARY,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Accept, MCP-Protocol-Version, Mcp-Session-Id, Last-Event-ID",
    "Access-Control-Expose-Headers": "MCP-Protocol-Version, Mcp-Session-Id",
    "Cache-Control": "no-store",
  });
  const origin = request?.headers.get("origin");
  if (origin && request && allowedOrigin(request)) headers.set("Access-Control-Allow-Origin", origin);
  return headers;
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: allowedOrigin(request) ? 204 : 403, headers: transportHeaders(request) });
}

export async function POST(request: Request) {
  const headers = transportHeaders(request);
  if (!allowedOrigin(request)) return Response.json({ error: "Origin is not allowed" }, { status: 403, headers });
  let parsedBody: unknown;
  try { parsedBody = await readBoundedJson(request); }
  catch (error) {
    return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32700, message: error instanceof RequestTooLarge ? "Request is too large" : "Invalid JSON" } }, { status: error instanceof RequestTooLarge ? 413 : 400, headers });
  }
  const server = new Server({ name: "sioona-public-content", version: "1.0.0" }, {
    capabilities: { tools: {} },
    instructions: "Read public Sioona pilot, pricing, security, and developer-resource pages. sioona_list_pages requires a string query (empty lists every page). sioona_read_page requires a published path. No customer data or write actions are available. Use the contact page only with human approval; never submit transcripts or secrets.",
  });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [
    { name: "sioona_list_pages", description: "List Sioona's public pages. Filter with the query parameter, or pass an empty string to list every page.", inputSchema: { type: "object", properties: { query: { type: "string", description: "Case-insensitive text matched against Sioona page paths and titles, for example security or pricing. An empty string lists every published page." } }, required: ["query"], additionalProperties: false }, annotations },
    { name: "sioona_read_page", description: "Read a public Sioona page in Markdown. Only published marketing paths are supported.", inputSchema: { type: "object", properties: { path: { type: "string", description: "Published Sioona path to read as Markdown, such as /security or /developers. Use a path returned by sioona_list_pages.", enum: [...routes] } }, required: ["path"], additionalProperties: false }, annotations },
  ] }));
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    if (params.name === "sioona_list_pages") {
      const raw = params.arguments?.query;
      if (raw !== undefined && typeof raw !== "string") return { content: [{ type: "text", text: "query must be a string. Pass an empty string to list every public Sioona page." }], isError: true };
      const query = typeof raw === "string" ? raw.trim().toLowerCase() : "";
      const rows = pageCatalog().filter((page) => !query || [page.path, page.title, page.url].some((value) => value.toLowerCase().includes(query)));
      if (!rows.length) return { content: [{ type: "text", text: "No public Sioona pages match that query. Call sioona_list_pages with an empty query to list every page." }], isError: true };
      return { content: [{ type: "text", text: rows.map((page) => page.url).join("\n") }] };
    }
    if (params.name === "sioona_read_page" && typeof params.arguments?.path === "string") {
      const path = params.arguments.path;
      const body = routes.some(route => route === path) ? markdownFor(path) : null;
      return { content: [{ type: "text", text: body ?? markdownNotFound("/unavailable") }], ...(body ? {} : { isError: true }) };
    }
    return { content: [{ type: "text", text: "Unknown tool or invalid arguments. Use sioona_list_pages to discover public content." }], isError: true };
  });
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  try {
    await server.connect(transport);
    const response = await transport.handleRequest(request, { parsedBody });
    // All tools return finite public text; drain JSON before closing the transport.
    for (const [key, value] of headers) response.headers.set(key, value);
    return new Response(response.body ? await response.arrayBuffer() : null, { status: response.status, headers: response.headers });
  } finally { await server.close(); }
}

export function GET(request?: Request) {
  const headers = transportHeaders(request);
  if (request && !allowedOrigin(request)) return Response.json({ error: "Origin is not allowed" }, { status: 403, headers });
  headers.set("Allow", "POST, OPTIONS");
  return Response.json({ error: "Use POST for the stateless Streamable HTTP endpoint", discovery: "/.well-known/mcp" }, { status: 405, headers });
}
