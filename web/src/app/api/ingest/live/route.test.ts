import { describe, expect, it, vi } from "vitest";
import { POST as intercomPost } from "./intercom/route";
import { POST as whatsappPost } from "./whatsapp/route";

describe("live ingest routes", () => {
  it("stays 404 while LIVE_INGEST is off", async () => {
    vi.stubEnv("LIVE_INGEST", "");
    const intercom = await intercomPost(
      new Request("http://localhost/api/ingest/live/intercom", { method: "POST" }),
    );
    const whatsapp = await whatsappPost(
      new Request("http://localhost/api/ingest/live/whatsapp", { method: "POST" }),
    );
    expect(intercom.status).toBe(404);
    expect(whatsapp.status).toBe(404);
    vi.unstubAllEnvs();
  });

  it("requires the tenant header and the webhook secret", async () => {
    vi.stubEnv("LIVE_INGEST", "1");
    vi.stubEnv("SIOONA_TENANT_ID", "tenant_partner");
    vi.stubEnv("INTERCOM_WEBHOOK_SECRET", "intercom-secret");
    vi.stubEnv("WHATSAPP_WEBHOOK_SECRET", "wa-secret");
    const missingTenant = await intercomPost(
      new Request("http://localhost/api/ingest/live/intercom", {
        method: "POST",
        headers: { "x-sioona-webhook-secret": "intercom-secret" },
      }),
    );
    const showcase = await whatsappPost(
      new Request("http://localhost/api/ingest/live/whatsapp", {
        method: "POST",
        headers: {
          "x-sioona-webhook-secret": "wa-secret",
          "x-sioona-tenant-id": "tenant_demo",
        },
      }),
    );
    expect(missingTenant.status).toBe(401);
    expect(showcase.status).toBe(401);
    vi.unstubAllEnvs();
  });
});
