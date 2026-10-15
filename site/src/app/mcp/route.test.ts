import { describe, expect, it } from "vitest";
import { GET, POST, OPTIONS } from "./route";
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
    const list = tools.find((tool: { name: string }) => tool.name === "sioona_list_pages");
    const read = tools.find((tool: { name: string }) => tool.name === "sioona_read_page");
    expect(list.inputSchema.required).toEqual(["query"]);
    expect(list.inputSchema.properties.query.type).toBe("string");
    expect(list.inputSchema.properties.query.description.length).toBeGreaterThan(20);
    expect(read.inputSchema.required).toEqual(["path"]);
    expect(read.inputSchema.properties.path.type).toBe("string");
    expect(read.inputSchema.properties.path.description).toContain("/developers");
    const listed = (await (await rpc("tools/call", { name: "sioona_list_pages", arguments: { query: "" } })).json()).result;
    expect(listed.content[0].text).toContain("/developers");
    const filtered = (await (await rpc("tools/call", { name: "sioona_list_pages", arguments: { query: "security" } })).json()).result;
    expect(filtered.content[0].text).toContain("/security");
    expect(filtered.content[0].text).not.toContain("/pricing");
    const unmatched = (await (await rpc("tools/call", { name: "sioona_list_pages", arguments: { query: "not-a-page" } })).json()).result;
    expect(unmatched.isError).toBe(true);
    const about = (await (await rpc("tools/call", { name: "sioona_read_page", arguments: { path: "/about" } })).json()).result;
    expect(about.content[0].text.length).toBeGreaterThan(500);
    const forbidden = (await (await rpc("tools/call", { name: "sioona_read_page", arguments: { path: "https://example.com/private" } })).json()).result;
    expect(forbidden.isError).toBe(true);
  });
  it("accepts initialized notifications and exposes browser transport headers", async () => {
    const headers = { origin: "https://is-agentic.com", accept: "application/json, text/event-stream", "content-type": "application/json", "mcp-protocol-version": "2025-11-25" };
    const preflight = OPTIONS(new Request("https://sioona-site.vercel.app/mcp", { method: "OPTIONS", headers }));
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version");
    const response = await POST(new Request("https://sioona-site.vercel.app/mcp", { method: "POST", headers, body: JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }) }));
    expect(response.status).toBe(202);
    expect(await response.text()).toBe("");
    expect(response.headers.get("access-control-allow-origin")).toBe(headers.origin);
    expect(response.headers.get("vary")).toContain("Accept, Origin");
    expect(OPTIONS(new Request("https://sioona-site.vercel.app/mcp", { headers: { origin: "https://untrusted.example" } })).status).toBe(403);
  });
  it("rejects invalid bodies and cross-origin requests and does not offer a GET stream", async () => {
    expect(GET(new Request("https://sioona-site.vercel.app/mcp")).status).toBe(405);
    const request = (body: string, origin?: string) => new Request("https://sioona-site.vercel.app/mcp", { method: "POST", headers: { "content-type": "application/json", ...(origin ? { origin } : {}) }, body });
    expect((await POST(request("no JSON"))).status).toBe(400);
    expect((await POST(request("x".repeat(17000)))).status).toBe(413);
    expect((await POST(request("{}", "https://untrusted.example"))).status).toBe(403);
  });
});
