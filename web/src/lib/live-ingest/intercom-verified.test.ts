import { createHmac } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyIntercomEvent } from "./intercom-verified";

const now = 1_800_000_000;
const payload = (extra = {}) => JSON.stringify({ type: "notification_event", id: "notif_1", app_id: "workspace_1", created_at: now, topic: "conversation.user.replied", data: { item: { id: "c1", updated_at: now, source: { body: "Call 9876543210", author: { type: "user" } }, created_at: now, conversation_parts: { conversation_parts: [] } } }, ...extra });
function request(body = payload(), signature = createHmac("sha1", "test-secret").update(body).digest("hex"), headers = {}) {
  return new Request("http://localhost/api/ingest/live/intercom", { method: "POST", body, headers: { "x-hub-signature": `sha1=${signature}`, ...headers } });
}
afterEach(() => vi.unstubAllEnvs());
function configure() {
  vi.stubEnv("INTERCOM_CLIENT_SECRET", "test-secret");
  vi.stubEnv("INTERCOM_INSTALLATIONS_JSON", JSON.stringify({ workspace_1: { tenantId: "tenant_partner", installationId: "installation_1" } }));
}
describe("Intercom verified envelope", () => {
  it("binds the signed workspace to server configuration and redacts canonical text", async () => {
    configure();
    const result = await verifyIntercomEvent(request(), now);
    expect(result.tenantId).toBe("tenant_partner");
    expect(result.event.installation_id).toBe("installation_1");
    expect(JSON.stringify(result.event)).not.toContain("9876543210");
    expect(result.event.conversation?.messages).toHaveLength(1);
  });
  it("rejects tampering, forged tenant selectors, unknown installations and malformed signatures", async () => {
    configure();
    for (const req of [request(payload(), "0".repeat(40)), request(payload(), "x"), request(payload(), undefined, { "x-sioona-tenant-id": "tenant_other" }), request(payload({ app_id: "unknown" }))]) {
      await expect(verifyIntercomEvent(req, now)).rejects.toThrow();
    }
  });
  it("rejects missing, stale, future and noninteger signed timestamps", async () => {
    configure();
    for (const created_at of [undefined, now - 901, now + 61, "1800000000", 0]) {
      await expect(verifyIntercomEvent(request(payload({ created_at })), now)).rejects.toThrow();
    }
    await expect(verifyIntercomEvent(request(payload({ created_at: now - 900 })), now)).resolves.toBeTruthy();
  });
  it("retains a reference for unsupported or incomplete events instead of silently accepting an empty parse", async () => {
    configure();
    const result = await verifyIntercomEvent(request(payload({ topic: "conversation.admin.replied", data: { item: { id: "c1" } } })), now);
    expect(result.event.kind).toBe("unresolved");
    expect(result.event.source_id).toBeTruthy();
    expect(result.event.conversation).toBeNull();
  });
});
