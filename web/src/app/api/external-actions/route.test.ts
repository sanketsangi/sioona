import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: { role: "admin", tenantId: "a" } as {role:string;tenantId:string} | null, mode: "postgres", request: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "signed" }) }) }));
vi.mock("@/lib/auth-token", () => ({ SESSION_COOKIE: "session", verifySessionToken: async () => state.session }));
vi.mock("@/lib/state-mode", () => ({ getStateMode: () => state.mode }));
vi.mock("@/lib/backend-client", () => ({ externalActionRequest: state.request }));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: (_tenant: string, fn: () => unknown) => fn() }));
import { GET, POST } from "./route";
beforeEach(() => { state.session = {role:"admin", tenantId:"a"}; state.mode="postgres"; state.request.mockReset().mockResolvedValue({}); });
const post = (body: unknown, origin="http://localhost") => new Request("http://localhost/api/external-actions", {method:"POST", headers:{origin}, body:JSON.stringify(body)});
it("requires signed admins and canonical mode", async () => {
  for (const session of [null, {role:"reviewer",tenantId:"a"}]) {
    state.session = session;
    expect((await GET(new Request("http://localhost"))).status).toBe(403);
    expect((await POST(post({action:"propose"}))).status).toBe(403);
  }
  expect(state.request).not.toHaveBeenCalled();
});
it("binds exact approval to signed tenant and never retries an uncertain request", async () => {
  const id="00000000-0000-4000-8000-000000000001";
  const approval={payload_sha256:"a".repeat(64), target:"123", action_version:1, expires_at:"2026-10-16T00:00:00Z"};
  expect((await POST(post({action:"approve", id, ...approval}))).status).toBe(200);
  expect(state.request).toHaveBeenCalledWith("a",`/proposals/${id}/approve`,"POST",approval);
  state.request.mockRejectedValue(new Error("synthetic timeout"));
  expect((await POST(post({action:"execute",id}))).status).toBe(409);
  expect(state.request).toHaveBeenCalledTimes(2);
});
it("rejects cross-origin writes, path injection and draft approval aliases", async () => {
  expect((await POST(post({action:"propose"},"https://attacker.test"))).status).toBe(403);
  for (const body of [{action:"approve_draft"}, {action:"execute",id:"../foreign"}, {action:"constructor"}]) expect((await POST(post(body))).status).toBe(400);
  expect(state.request).not.toHaveBeenCalled();
});
