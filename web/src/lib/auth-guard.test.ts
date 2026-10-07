import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { guardApi } from "./auth-guard";
import { sessionCookie, signSession } from "./auth-token";
import { DEMO_TENANT_ID, currentStoreTenant, runWithTenant } from "./tenant-context";

const SECRET = "test-auth-secret";

describe("guardApi", () => {
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "SIOONA_AUTH_ENFORCE",
      "AUTH_SECRET",
      "SIOONA_PUBLIC_DEMO",
      "VERCEL_ENV",
      "SIOONA_ENV",
      "SIOONA_ALLOW_DEMO_ACTIONS",
    ]) {
      previous[key] = process.env[key];
    }
    process.env.SIOONA_AUTH_ENFORCE = "1";
    process.env.AUTH_SECRET = SECRET;
    delete process.env.SIOONA_PUBLIC_DEMO;
    delete process.env.VERCEL_ENV;
    delete process.env.SIOONA_ENV;
    delete process.env.SIOONA_ALLOW_DEMO_ACTIONS;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("rejects mutations without a session", async () => {
    const result = await guardApi(new Request("http://localhost/api/ingest"), "mutate");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.response.status).toBe(401);
  });

  it("authorizes a signed-in reviewer without leaking tenant context", async () => {
    const token = await signSession({
      email: "reviewer@partner.example",
      role: "reviewer",
      tenantId: "tenant_partner",
    });
    const request = new Request("http://localhost/api/store", {
      headers: { cookie: `${sessionCookie(token).split(";")[0]}` },
    });
    const result = await guardApi(request, "read");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.session.tenantId).toBe("tenant_partner");
    expect(() => currentStoreTenant()).toThrow("Tenant scope required");
  });

  it("returns a login path for an invalid API session cookie", async () => {
    process.env.SIOONA_PUBLIC_DEMO = "1";
    const request = new Request("http://localhost/api/store", {
      headers: { cookie: "sioona_session=not.a.valid.token" },
    });
    const result = await guardApi(request, "read");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: "Sign in required.",
        loginPath: "/login",
      });
    }
  });

  it("returns a login path for an expired API session", async () => {
    process.env.SIOONA_PUBLIC_DEMO = "1";
    const token = await signSession({
      email: "reviewer@partner.example",
      role: "reviewer",
      tenantId: "tenant_partner",
      exp: Math.floor(Date.now() / 1000) - 30,
    });
    const request = new Request("http://localhost/api/store", {
      headers: { cookie: `sioona_session=${token}` },
    });
    const result = await guardApi(request, "read");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({
        error: "Sign in required.",
        loginPath: "/login",
      });
    }
  });

  it("keeps anonymous reads on the demo tenant only", async () => {
    process.env.SIOONA_PUBLIC_DEMO = "1";
    const result = await guardApi(new Request("http://localhost/api/store"), "read");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.session.role).toBe("demo");
      expect(result.session.tenantId).toBe(DEMO_TENANT_ID);
    }
  });

  it("blocks reset unless the caller is an admin and demo actions are allowed", async () => {
    process.env.VERCEL_ENV = "production";
    const reviewer = await signSession({
      email: "reviewer@partner.example",
      role: "reviewer",
      tenantId: "tenant_partner",
    });
    const reviewerReq = new Request("http://localhost/api/store", {
      method: "POST",
      headers: { cookie: sessionCookie(reviewer).split(";")[0] },
    });
    const denied = await guardApi(reviewerReq, "destructive");
    expect(denied.ok).toBe(false);
    if (!denied.ok) expect(denied.response.status).toBe(403);

    process.env.SIOONA_ALLOW_DEMO_ACTIONS = "1";
    const admin = await signSession({
      email: "admin@partner.example",
      role: "admin",
      tenantId: "tenant_partner",
    });
    const adminReq = new Request("http://localhost/api/store", {
      method: "POST",
      headers: { cookie: sessionCookie(admin).split(";")[0] },
    });
    const allowed = await guardApi(adminReq, "destructive");
    expect(allowed.ok).toBe(true);
    if (allowed.ok) expect(allowed.session.tenantId).toBe(DEMO_TENANT_ID);
  });
  it("isolates concurrent callbacks and restores an existing outer tenant", async () => {
    const requests = await Promise.all(["tenant_alpha", "tenant_beta"].map(async (tenantId) => {
      const token = await signSession({ email: `${tenantId}@example.test`, role: "reviewer", tenantId });
      return new Request("http://localhost/api/store", { headers: { cookie: sessionCookie(token).split(";")[0] } });
    }));
    await runWithTenant("tenant_outer", async () => {
      await Promise.all(requests.map(async (request, index) => {
        const result = await guardApi(request, "read");
        if (!result.ok) throw new Error("Expected signed session");
        expect(currentStoreTenant()).toBe("tenant_outer");
        await runWithTenant(result.session.tenantId, async () => {
          await new Promise((resolve) => setTimeout(resolve, index === 0 ? 10 : 1));
          expect(currentStoreTenant()).toBe(index === 0 ? "tenant_alpha" : "tenant_beta");
          await Promise.resolve().then(() => expect(currentStoreTenant()).toBe(result.session.tenantId));
        });
        expect(currentStoreTenant()).toBe("tenant_outer");
      }));
    });
  });

});
