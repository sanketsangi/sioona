import { authEnforced } from "./auth-token";
import { AsyncLocalStorage } from "node:async_hooks";

/** Public showcase tenant. Real partner sessions must use a different id. */
export const DEMO_TENANT_ID = "tenant_demo";

const storeTenant = new AsyncLocalStorage<string>();

/** Tenant whose JSON file and Neon calls this request should use. */
export function currentStoreTenant(): string {
  const tenant = storeTenant.getStore();
  if (tenant) return tenant;
  if (authEnforced()) throw new Error("Tenant scope required for authenticated store operations.");
  return DEMO_TENANT_ID;
}

/**
 * Bind the rest of this request's async work to `tenantId`.
 * Prefer this over wrapping a 500-line page when the call stack is already open.
 */
export function enterStoreTenant(tenantId: string): void {
  storeTenant.enterWith(tenantId);
}

export function runWithTenant<T>(tenantId: string, fn: () => T): T {
  return storeTenant.run(tenantId, fn);
}
