import { afterEach, describe, expect, it } from "vitest";

import { authenticatePilotUser, loadPilotUsers } from "@/lib/auth-users";

const originalUsers = process.env.SIOONA_PILOT_USERS;

afterEach(() => {
  if (originalUsers === undefined) delete process.env.SIOONA_PILOT_USERS;
  else process.env.SIOONA_PILOT_USERS = originalUsers;
});

describe("loadPilotUsers", () => {
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
