import { describe, expect, it } from "vitest";
import { GET, POST } from "./route";
import { GET as discovery } from "../.well-known/mcp/route";

function rpc(method: string, params?: object) {
  return POST(new Request("https://sioona-site.vercel.app/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "mcp-protocol-version": "2025-11-25" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) }));
}
describe("public content MCP", () => {
  it("advertises a real endpoint and completes an initialize handshake", async () => {
    const card = await discovery().json();
    expect(card.remotes[0].url).toMatch(/\/mcp$/);
    const response = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "verification", version: "1" } });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result.serverInfo.name).toBe("sioona-public-content");
    expect(body.result.capabilities.tools).toBeDefined();
  });
  it("lists only read-only tools and reads public text without arbitrary fetching", async () => {
    const tools = (await (await rpc("tools/list")).json()).result.tools;
    expect(tools).toHaveLength(2);
    expect(tools.every((tool: { annotations: { readOnlyHint: boolean } }) => tool.annotations.readOnlyHint)).toBe(true);
    const about = (await (await rpc("tools/call", { name: "sioona_read_page", arguments: { path: "/about" } })).json()).result;
    expect(about.content[0].text.length).toBeGreaterThan(500);
    const forbidden = (await (await rpc("tools/call", { name: "sioona_read_page", arguments: { path: "https://example.com/private" } })).json()).result;
    expect(forbidden.isError).toBe(true);
  });
  it("rejects invalid bodies and cross-origin requests and does not offer a GET stream", async () => {
    expect(GET().status).toBe(405);
    const request = (body: string, origin?: string) => new Request("https://sioona-site.vercel.app/mcp", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body });
    expect((await POST(request("no JSON"))).status).toBe(400);
    expect((await POST(request("x".repeat(17000)))).status).toBe(413);
    expect((await POST(request("{}", "https://untrusted.example"))).status).toBe(403);
  });
});
