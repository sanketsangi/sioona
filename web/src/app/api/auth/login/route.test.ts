import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { POST } from "./route";

describe("POST /api/auth/login", () => {
  const previous: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const key of [
      "AUTH_SECRET",
      "SIOONA_ADMIN_EMAIL",
      "SIOONA_ADMIN_PASSWORD",
      "SIOONA_TENANT_ID",
      "SIOONA_PILOT_USERS",
    ]) {
      previous[key] = process.env[key];
    }
    process.env.AUTH_SECRET = "test-auth-secret";
    process.env.SIOONA_TENANT_ID = "tenant_partner";
    process.env.SIOONA_ADMIN_EMAIL = "admin@partner.example";
    process.env.SIOONA_ADMIN_PASSWORD = "pilot-secret";
    delete process.env.SIOONA_PILOT_USERS;
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  it("sets a session cookie for a known pilot user", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@partner.example",
          password: "pilot-secret",
        }),
      }),
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { email: string; tenantId: string };
    expect(body.email).toBe("admin@partner.example");
    expect(body.tenantId).toBe("tenant_partner");
    expect(response.headers.get("set-cookie")).toMatch(/sioona_session=/);
  });

  it("does not reveal which field was wrong", async () => {
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@partner.example",
          password: "nope",
        }),
      }),
    );
    expect(response.status).toBe(401);
    const body = (await response.json()) as { error: string };
    expect(body.error).toBe("Email or password is incorrect.");
  });

  it("refuses an account pinned to the public demo tenant", async () => {
    process.env.SIOONA_TENANT_ID = "tenant_demo";
    const response = await POST(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: "admin@partner.example",
          password: "pilot-secret",
        }),
      }),
    );
    expect(response.status).toBe(401);
  });
});
