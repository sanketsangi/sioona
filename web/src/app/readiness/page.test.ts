import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  session: {
    tenantId: "tenant_a",
    role: "admin",
    email: "admin@example.com",
    exp: 9999999999,
  } as null | { tenantId: string; role: string; email: string; exp: number },
  read: vi.fn(),
}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => ({ value: "signed" }) }),
}));
vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
vi.mock("@/lib/auth-token", () => ({
  SESSION_COOKIE: "session",
  verifySessionToken: async () => state.session,
}));
vi.mock("@/lib/operator-readiness", () => ({
  readOperatorReadiness: state.read,
}));
vi.mock("@/components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) =>
    React.createElement("main", null, children),
}));
import ReadinessPage from "./page";
beforeEach(() => {
  state.read.mockReset();
  state.session = {
    tenantId: "tenant_a",
    role: "admin",
    email: "admin@example.com",
    exp: 9999999999,
  };
  state.read.mockResolvedValue({
    observedAt: "2026-10-18T00:00:00Z",
    revision: null,
    controls: null,
    ledger: null,
  });
});
it("requires a signed-in administrator before any backend observations", async () => {
  state.session = null;
  await expect(ReadinessPage()).rejects.toThrow("REDIRECT:/login");
  expect(state.read).not.toHaveBeenCalled();
  state.session = {
    tenantId: "tenant_b",
    role: "reviewer",
    email: "reviewer@example.com",
    exp: 9999999999,
  };
  await expect(ReadinessPage()).rejects.toThrow("REDIRECT:/?view=insights");
  expect(state.read).not.toHaveBeenCalled();
});
it("shows unavailable data and historical acceptance as pending with no mutation controls", async () => {
  const html = renderToStaticMarkup(await ReadinessPage());
  expect(state.read).toHaveBeenCalledWith("tenant_a");
  expect(html).toContain("Live backend revision and schema: unavailable");
  expect(html).toContain("Pending operator sign-off");
  expect(html).not.toContain("<form");
  expect(html).not.toContain("<button");
});
