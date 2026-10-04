import { afterEach, describe, expect, it } from "vitest";

import { authenticatePilotUser, hashPilotPassword, loadPilotUsers, verifyPilotPassword } from "@/lib/auth-users";

const originalUsers = process.env.SIOONA_PILOT_USERS;

afterEach(() => {
  if (originalUsers === undefined) delete process.env.SIOONA_PILOT_USERS;
  else process.env.SIOONA_PILOT_USERS = originalUsers;
});

describe("loadPilotUsers", () => {
  it("accepts generated password hashes and rejects a wrong password", () => {
    const user = { email: "reviewer@example.test", role: "reviewer" as const,
      tenantId: "tenant_partner", passwordHash: hashPilotPassword("pilot-secret") };
    expect(verifyPilotPassword("pilot-secret", user)).toBe(true);
    expect(verifyPilotPassword("wrong", user)).toBe(false);
  });

  it.each([
    "scrypt$zz$zz", "scrypt$00$00", "scrypt$" + "00".repeat(16) + "$gg",
    "scrypt$" + "00".repeat(16) + "$" + "00".repeat(32) + "$extra",
    "scrypt$" + "00".repeat(16) + "$" + "00".repeat(10000),
  ])("fails closed for malformed configured hashes (%#)", (passwordHash) => {
    process.env.SIOONA_PILOT_USERS = JSON.stringify([{ email: "reviewer@example.test",
      role: "reviewer", tenantId: "tenant_partner", passwordHash }]);
    expect(authenticatePilotUser("reviewer@example.test", "anything")).toBeNull();
  });

  it("keeps admin and reviewer accounts and drops a demo role", () => {
    process.env.SIOONA_PILOT_USERS = JSON.stringify([
      {
        email: "Demo@sioona.ai",
        role: "demo",
        tenantId: "tenant_partner",
        password: "demo-secret",
      },
      {
        email: "Admin@partner.example",
        role: "admin",
        tenantId: "tenant_partner",
        password: "admin-secret",
      },
      {
        email: "reviewer@partner.example",
        role: "reviewer",
        tenantId: "tenant_partner",
        password: "reviewer-secret",
      },
    ]);

    expect(loadPilotUsers()).toEqual([
      {
        email: "admin@partner.example",
        role: "admin",
        tenantId: "tenant_partner",
        password: "admin-secret",
        passwordHash: undefined,
      },
      {
        email: "reviewer@partner.example",
        role: "reviewer",
        tenantId: "tenant_partner",
        password: "reviewer-secret",
        passwordHash: undefined,
      },
    ]);
    expect(
      authenticatePilotUser("demo@sioona.ai", "demo-secret"),
    ).toBeNull();
  });
});
