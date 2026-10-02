import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  authEnforced,
  demoActionsAllowed,
  isTenantId,
  publicDemoEnabled,
  readCookie,
  SESSION_COOKIE,
  SESSION_MAX_AGE_SEC,
  sessionCookie,
  signSession,
  verifySessionToken,
} from "./auth-token";

const ENV_KEYS = [
  "AUTH_SECRET",
  "NODE_ENV",
  "VERCEL_ENV",
  "SIOONA_ENV",
  "SIOONA_AUTH_ENFORCE",
  "SIOONA_PUBLIC_DEMO",
  "SIOONA_ALLOW_DEMO_ACTIONS",
] as const;

const saved: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const key of ENV_KEYS) saved[key] = process.env[key];
  for (const key of ENV_KEYS) {
    if (key !== "NODE_ENV") delete process.env[key];
  }
  process.env.AUTH_SECRET = "test-secret";
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  for (const key of ENV_KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
});

const claims = {
  email: "admin@partner.example",
  role: "admin" as const,
  tenantId: "tenant_partner",
};

describe("isTenantId", () => {
  it.each(["tenant_demo", "tenant_a1_b2", "tenant_" + "a".repeat(64)])(
    "accepts %s",
    (value) => expect(isTenantId(value)).toBe(true),
  );

  it.each([
    "tenant_",
    "Tenant_demo",
    "tenant-demo",
    "demo",
    "tenant_UPPER",
    "tenant_" + "a".repeat(65),
    "tenant_demo\n",
  ])("rejects %j", (value) => expect(isTenantId(value)).toBe(false));
});

describe("signSession / verifySessionToken", () => {
  it("round-trips claims and applies the default expiry", async () => {
    const before = Math.floor(Date.now() / 1000);
    const token = await signSession(claims);
    const verified = await verifySessionToken(token);

    expect(verified).toMatchObject(claims);
    expect(verified!.exp).toBeGreaterThanOrEqual(before + SESSION_MAX_AGE_SEC);
    expect(verified!.exp).toBeLessThanOrEqual(
      Math.floor(Date.now() / 1000) + SESSION_MAX_AGE_SEC,
    );
  });

  it("throws when AUTH_SECRET is missing", async () => {
    delete process.env.AUTH_SECRET;
    await expect(signSession(claims)).rejects.toThrow("AUTH_SECRET");
  });

  it("refuses to sign a malformed tenant id", async () => {
    await expect(
      signSession({ ...claims, tenantId: "partner" }),
    ).rejects.toThrow("tenantId");
  });

  it("rejects an expired token", async () => {
    const token = await signSession({
      ...claims,
      exp: Math.floor(Date.now() / 1000) - 1,
    });
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a token once the clock passes exp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-01T00:00:00Z"));
    const token = await signSession(claims);
    expect(await verifySessionToken(token)).not.toBeNull();

    vi.setSystemTime(new Date("2026-10-01T12:00:02Z"));
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a tampered payload", async () => {
    const token = await signSession({ ...claims, role: "reviewer" });
    const [, sig] = token.split(".");
    const forged = btoa(
      JSON.stringify({
        ...claims,
        role: "admin",
        exp: Math.floor(Date.now() / 1000) + 1000,
      }),
    )
      .replaceAll("+", "-")
      .replaceAll("/", "_")
      .replaceAll("=", "");
    expect(await verifySessionToken(`${forged}.${sig}`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signSession(claims);
    process.env.AUTH_SECRET = "other-secret";
    expect(await verifySessionToken(token)).toBeNull();
  });

  it("rejects a truncated signature", async () => {
    const token = await signSession(claims);
    expect(await verifySessionToken(token.slice(0, -2))).toBeNull();
  });

  it.each([undefined, null, "", "nodot", ".sig", "payload.", "a.b.c"])(
    "rejects malformed token %j",
    async (value) => {
      expect(await verifySessionToken(value)).toBeNull();
    },
  );

  it("returns null when no secret is configured", async () => {
    const token = await signSession(claims);
    delete process.env.AUTH_SECRET;
    expect(await verifySessionToken(token)).toBeNull();
  });
});

describe("authEnforced", () => {
  it("honours explicit overrides first", () => {
    process.env.SIOONA_AUTH_ENFORCE = "1";
    expect(authEnforced()).toBe(true);
    process.env.SIOONA_AUTH_ENFORCE = "0";
    expect(authEnforced()).toBe(false);
  });

  it("is off under Vitest by default", () => {
    expect(authEnforced()).toBe(false);
  });

  it("enforces in production when not under Vitest", () => {
    vi.stubEnv("VITEST", "");
    process.env.VERCEL_ENV = "production";
    expect(authEnforced()).toBe(true);
  });

  it("enforces outside production only when a secret is set", () => {
    vi.stubEnv("VITEST", "");
    expect(authEnforced()).toBe(true);
    delete process.env.AUTH_SECRET;
    expect(authEnforced()).toBe(false);
  });
});

describe("publicDemoEnabled", () => {
  it("is open outside production", () => {
    expect(publicDemoEnabled()).toBe(true);
  });

  it("is closed in production unless opted in", () => {
    process.env.VERCEL_ENV = "production";
    expect(publicDemoEnabled()).toBe(false);
    process.env.SIOONA_PUBLIC_DEMO = "1";
    expect(publicDemoEnabled()).toBe(true);
  });

  it("can be closed explicitly", () => {
    process.env.SIOONA_PUBLIC_DEMO = "0";
    expect(publicDemoEnabled()).toBe(false);
  });
});

describe("demoActionsAllowed", () => {
  it("allows demo actions outside production", () => {
    expect(demoActionsAllowed()).toBe(true);
  });

  it.each([{ VERCEL_ENV: "production" }, { SIOONA_ENV: "production" }])(
    "blocks demo actions in production (%j) unless allowed",
    (env) => {
      Object.assign(process.env, env);
      expect(demoActionsAllowed()).toBe(false);
      process.env.SIOONA_ALLOW_DEMO_ACTIONS = "1";
      expect(demoActionsAllowed()).toBe(true);
    },
  );
});

describe("sessionCookie", () => {
  it("sets HttpOnly, Path, SameSite and Max-Age without Secure in dev", () => {
    vi.stubEnv("NODE_ENV", "development");
    const cookie = sessionCookie("tok");
    expect(cookie).toBe(
      `${SESSION_COOKIE}=tok; HttpOnly; Path=/; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SEC}`,
    );
  });

  it("adds Secure in production and honours maxAge", () => {
    process.env.VERCEL_ENV = "production";
    const cookie = sessionCookie("tok", 0);
    expect(cookie).toContain("Max-Age=0");
    expect(cookie.endsWith("; Secure")).toBe(true);
  });
});

describe("readCookie", () => {
  it("returns undefined for a missing header or cookie", () => {
    expect(readCookie(null, "a")).toBeUndefined();
    expect(readCookie("b=1", "a")).toBeUndefined();
  });

  it("finds a cookie among several and trims whitespace", () => {
    expect(readCookie("a=1;  sioona_session=abc.def ; c=3", SESSION_COOKIE)).toBe(
      "abc.def",
    );
  });

  it("keeps '=' characters inside the value", () => {
    expect(readCookie("a=x=y==", "a")).toBe("x=y==");
  });

  it("does not match on a name prefix", () => {
    expect(readCookie("sioona_session_old=zzz", SESSION_COOKIE)).toBeUndefined();
  });

  it("ignores segments without a name", () => {
    expect(readCookie("=orphan; a=1", "a")).toBe("1");
  });
});
