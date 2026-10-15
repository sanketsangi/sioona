import { createHmac } from "node:crypto";
import { afterEach, expect, it, vi } from "vitest";
import { POST as intercomPost } from "./intercom/route";
import { POST as whatsappPost } from "./whatsapp/route";
import { POST as poll } from "./intercom/poll/route";
import * as backend from "@/lib/backend-client";
afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });
it("keeps all sources disabled by default", async () => {
  vi.stubEnv("LIVE_INGEST", "");
  expect((await intercomPost(new Request("http://localhost", { method: "POST" }))).status).toBe(404);
  expect((await whatsappPost()).status).toBe(404);
  expect((await poll()).status).toBe(404);
});
it("rejects the old shared secret and tenant selector", async () => {
  vi.stubEnv("LIVE_INGEST", "1");
  expect((await intercomPost(new Request("http://localhost", { method: "POST", headers: {
    "x-sioona-webhook-secret":"old-secret", "x-sioona-tenant-id":"tenant_partner",
  }, body:"{}" }))).status).toBe(401);
});
function signedRequest() {
  const body = JSON.stringify({ id:"event1", app_id:"workspace1", created_at:Math.floor(Date.now()/1000), topic:"ping", data:{} });
  return new Request("http://localhost", { method:"POST", body, headers: { "x-hub-signature":`sha1=${createHmac("sha1","secret").update(body).digest("hex")}` } });
}
it("acknowledges only after durable acceptance under the resolved principal", async () => {
  vi.stubEnv("LIVE_INGEST","1"); vi.stubEnv("INTERCOM_CLIENT_SECRET","secret");
  vi.stubEnv("INTERCOM_INSTALLATIONS_JSON", JSON.stringify({ workspace1:{ tenantId:"tenant_partner", installationId:"install1" } }));
  const accept = vi.spyOn(backend,"acceptIntercomEvent").mockResolvedValue({ event_id:"event1",state:"dead_lettered",job_id:null });
  const response = await intercomPost(signedRequest());
  expect(response.status).toBe(202);
  expect(accept.mock.calls[0][0]).toBe("tenant_partner");
  accept.mockRejectedValue(new Error("private customer text"));
  const failed = await intercomPost(signedRequest());
  expect(failed.status).toBe(503);
  expect(failed.headers.get("Retry-After")).toBe("30");
  expect(await failed.text()).not.toContain("private customer text");
});
