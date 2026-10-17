import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { middleware } from "@/middleware";
import { signSession } from "@/lib/auth-token";

function call(path: string, method: string) {
  return middleware(new Request(`http://localhost${path}`, { method }));
}

describe("middleware live-ingest exemption", () => {
  beforeEach(() => {
    vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
    vi.stubEnv("SIOONA_PUBLIC_DEMO", "0");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it.each([
    "/api/ingest/live/intercom",
    "/api/ingest/live/intercom/poll",
    "/api/ingest/live/whatsapp",
  ])("lets %s POST through without a session when LIVE_INGEST=1", async (path) => {
    vi.stubEnv("LIVE_INGEST", "1");
    const response = await call(path, "POST");
    expect(response.status).toBe(200);
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("keeps the session gate while LIVE_INGEST is off", async () => {
    vi.stubEnv("LIVE_INGEST", "");
    const response = await call("/api/ingest/live/whatsapp", "POST");
    expect(response.status).toBe(401);
  });

  it("does not open other methods on a webhook path", async () => {
    vi.stubEnv("LIVE_INGEST", "1");
    const response = await call("/api/ingest/live/whatsapp", "GET");
    expect(response.status).toBe(401);
  });

  it("keeps OAuth start and callback behind the session", async () => {
    vi.stubEnv("LIVE_INGEST", "1");
    const start = await call("/api/ingest/live/intercom/oauth", "GET");
    const callback = await call("/api/ingest/live/intercom/callback", "GET");
    expect(start.status).toBe(401);
    expect(callback.status).toBe(401);
  });

  it("redirects an invalid document session even when the public demo is on", async () => {
    vi.stubEnv("SIOONA_PUBLIC_DEMO", "1");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret");
    const response = await middleware(
      new Request("http://localhost/insights", {
        headers: { cookie: "sioona_session=not.a.valid.token" },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("redirects an expired document session even when the public demo is on", async () => {
    vi.stubEnv("SIOONA_PUBLIC_DEMO", "1");
    vi.stubEnv("AUTH_SECRET", "test-auth-secret");
    const token = await signSession({
      email: "reviewer@partner.example",
      role: "reviewer",
      tenantId: "tenant_partner",
      exp: Math.floor(Date.now() / 1000) - 30,
    });
    const response = await middleware(
      new Request("http://localhost/insights", {
        headers: { cookie: `sioona_session=${token}` },
      }),
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost/login");
  });

  it("keeps a missing cookie on the public demo", async () => {
    vi.stubEnv("SIOONA_PUBLIC_DEMO", "1");
    const response = await call("/insights", "GET");
    expect(response.headers.get("x-middleware-next")).toBe("1");
  });

  it("does not open neighbouring routes", async () => {
    vi.stubEnv("LIVE_INGEST", "1");
    const upload = await call("/api/ingest", "POST");
    const lookalike = await call("/api/ingest/live/whatsapp-extra", "POST");
    const store = await call("/api/store", "POST");
    expect(upload.status).toBe(401);
    expect(lookalike.status).toBe(401);
    expect(store.status).toBe(401);
  });
});

describe("public pilot intake boundary",()=>{afterEach(()=>vi.unstubAllEnvs());it("opens only the contact form and its bounded POST, preserving all neighboring gates",async()=>{vi.stubEnv("SIOONA_AUTH_ENFORCE","1");vi.stubEnv("SIOONA_PUBLIC_DEMO","0");expect((await call("/pilot-request","GET")).headers.get("x-middleware-next")).toBe("1");expect((await call("/api/pilot-requests","POST")).headers.get("x-middleware-next")).toBe("1");for(const path of ["/api/pilot-requests/other","/api/pilot-requests","/api/store"]) {const response=await call(path,path === "/api/pilot-requests"?"GET":"POST");expect(response.status).toBe(401);}});});
