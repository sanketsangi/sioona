import { publicHeaders } from "@/lib/http-headers";
import { SUPPORTED_PROTOCOL_VERSIONS } from "@modelcontextprotocol/sdk/types.js";
import { siteConfig } from "@/lib/site";

export function GET() {
  return Response.json({
    $schema: "https://static.modelcontextprotocol.io/schemas/v1/server-card.schema.json",
    name: "si.sioona/public-content", title: "Sioona Conversation Intelligence public information", version: "1.0.0",
    description: "Read-only Sioona marketing, pilot, pricing and security information. No customer data or write tools.",
    websiteUrl: siteConfig.url,
    remotes: [{ type: "streamable-http", url: new URL("/mcp", siteConfig.url).toString(), supportedProtocolVersions: SUPPORTED_PROTOCOL_VERSIONS.filter(version => version >= "2025-03-26") }],
  }, { headers: { "Cache-Control": "public, max-age=3600", ...publicHeaders, "Access-Control-Allow-Origin": "*" } });
}
