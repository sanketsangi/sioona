import { afterEach, describe, expect, it, vi } from "vitest";

import {
  currentStoreTenant,
  DEMO_TENANT_ID,
  enterStoreTenant,
  runWithTenant,
} from "./tenant-context";

afterEach(() => vi.unstubAllEnvs());

describe("tenant-context", () => {
  it("fails closed without context when authentication is enforced", () => {
    vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
    expect(() => currentStoreTenant()).toThrow("Tenant scope required");
    expect(runWithTenant("tenant_partner", () => currentStoreTenant())).toBe("tenant_partner");
  });
  it("defaults to the demo tenant outside any scope", () => {
    expect(currentStoreTenant()).toBe(DEMO_TENANT_ID);
  });

  it("scopes the tenant to the callback, including across awaits", async () => {
    const seen = await runWithTenant("tenant_acme", async () => {
      await Promise.resolve();
      return currentStoreTenant();
    });
    expect(seen).toBe("tenant_acme");
    expect(currentStoreTenant()).toBe(DEMO_TENANT_ID);
  });

  it("nests and restores the outer tenant", () => {
    const result = runWithTenant("tenant_outer", () => {
      const inner = runWithTenant("tenant_inner", () => currentStoreTenant());
      return [inner, currentStoreTenant()];
    });
    expect(result).toEqual(["tenant_inner", "tenant_outer"]);
  });

  it("keeps concurrent scopes isolated", async () => {
    const run = (tenant: string, delay: number) =>
      runWithTenant(tenant, async () => {
        await new Promise((resolve) => setTimeout(resolve, delay));
        return currentStoreTenant();
      });
    const [a, b] = await Promise.all([run("tenant_a", 10), run("tenant_b", 1)]);
    expect([a, b]).toEqual(["tenant_a", "tenant_b"]);
  });

  it("enterStoreTenant binds the remaining async work of the current scope", async () => {
    const seen = await runWithTenant("tenant_start", async () => {
      enterStoreTenant("tenant_entered");
      await Promise.resolve();
      return currentStoreTenant();
    });
    expect(seen).toBe("tenant_entered");
  });
});
