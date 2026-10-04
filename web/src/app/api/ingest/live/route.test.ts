import { describe, expect, it, vi } from "vitest";
import { POST as intercomPoll } from "./intercom/poll/route";
import * as intercomClient from "@/lib/live-ingest/intercom";
import * as liveAccept from "@/lib/live-ingest/accept";
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

it("returns a retryable content-free response when publication fails", async () => {
  vi.stubEnv("LIVE_INGEST", "1");
  vi.stubEnv("SIOONA_TENANT_ID", "tenant_partner");
  vi.stubEnv("INTERCOM_WEBHOOK_SECRET", "secret");
  vi.stubEnv("WHATSAPP_WEBHOOK_SECRET", "secret");
  vi.stubEnv("INTERCOM_ACCESS_TOKEN", "local-test-token");
  const poll = vi.spyOn(intercomClient, "pollIntercomConversations").mockResolvedValue([]);
  const accept = vi.spyOn(liveAccept, "acceptLiveChats").mockRejectedValue(new Error("private customer text"));
  try {
    for (const post of [intercomPost, whatsappPost, intercomPoll]) {
      const response = await post(new Request("http://localhost/api/ingest/live/webhook", {
        method: "POST", headers: { "x-sioona-webhook-secret": "secret", "x-sioona-tenant-id": "tenant_partner" },
        body: JSON.stringify({}) }));
      expect(response.status).toBe(503);
      expect(response.headers.get("Retry-After")).toBe("30");
      expect(await response.json()).toEqual({ error: "live_ingest_not_published", sent: false });
    }
  } finally { accept.mockRestore(); poll.mockRestore(); vi.unstubAllEnvs(); }
});
