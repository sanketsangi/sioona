import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { email: "admin@example.test", role: "admin", tenantId: "tenant_a", exp: 9999999999 } as null | { email: string; role: "admin" | "reviewer"; tenantId: string; exp: number },
  getDashboard: vi.fn(),
}));

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => ({ value: "session" }) })) }));
vi.mock("next/navigation", () => ({ redirect: vi.fn((path: string) => { throw new Error(`REDIRECT:${path}`); }) }));
vi.mock("@/lib/auth-token", () => ({
  authEnforced: () => true,
  publicDemoEnabled: () => false,
  SESSION_COOKIE: "session",
  verifySessionToken: vi.fn(async () => state.session),
}));
vi.mock("@/lib/account-surface", () => ({ accountSurface: () => ({ primary: "admin", secondary: "Admin", email: "admin@example.test", role: "admin", anonymous: false }) }));
vi.mock("@/lib/backend-client", () => ({ BackendClientError: class extends Error {}, getEconomicsDashboard: state.getDashboard }));
vi.mock("@/components/AppShell", () => ({ AppShell: ({ children }: { children: React.ReactNode }) => React.createElement("main", null, children) }));
vi.mock("@/components/EconomicsDashboard", () => ({ EconomicsDashboard: () => React.createElement("div", null, "dashboard-ready") }));

import EconomicsPage from "./page";

describe("EconomicsPage authorization and date state", () => {
  beforeEach(() => {
    state.session = { email: "admin@example.test", role: "admin", tenantId: "tenant_a", exp: 9999999999 };
    state.getDashboard.mockReset().mockResolvedValue({});
  });

  it("redirects reviewers before loading tenant economics", async () => {
    state.session = { email: "reviewer@example.test", role: "reviewer", tenantId: "tenant_a", exp: 9999999999 };
    await expect(EconomicsPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/?view=insights");
    expect(state.getDashboard).not.toHaveBeenCalled();
  });

  it("uses the signed tenant and preserves a half-open URL date window", async () => {
    const result = await EconomicsPage({ searchParams: Promise.resolve({ from: "2026-10-01", to: "2026-10-14" }) });
    expect(state.getDashboard).toHaveBeenCalledWith("tenant_a", "2026-09-30T18:30:00.000Z", "2026-10-14T18:30:00.000Z");
    const html = renderToStaticMarkup(result);
    expect(html).toContain('name="from"');
    expect(html).toContain('value="2026-10-01"');
    expect(html).toContain("dashboard-ready");
  });
});

 it("handles invalid calendar dates without crashing", async () => {
    await EconomicsPage({ searchParams: Promise.resolve({ from: "2026-02-30", to: "2026-99-99" }) });
    expect(state.getDashboard).toHaveBeenCalledWith("tenant_a", undefined, undefined);
 });
