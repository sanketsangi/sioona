import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ session: { role: "admin", tenantId: "a" } as {role:string;tenantId:string} | null, mode: "postgres", request: vi.fn() }));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => ({ value: "signed" }) }) }));
vi.mock("@/lib/auth-token", () => ({ SESSION_COOKIE: "session", verifySessionToken: async () => state.session }));
vi.mock("@/lib/state-mode", () => ({ getStateMode: () => state.mode }));
vi.mock("@/lib/backend-client", () => ({ lifecycleRequest: state.request, BackendClientError: class extends Error {} }));
vi.mock("@/lib/tenant-context", () => ({ runWithTenant: (_tenant: string, fn: () => unknown) => fn() }));
import { GET, POST } from "./route";
beforeEach(() => { state.session = {role:"admin", tenantId:"a"}; state.mode="postgres"; state.request.mockReset().mockResolvedValue({id:"00000000-0000-4000-8000-000000000001"}); });
const post = (body: unknown, origin="http://localhost") => new Request("http://localhost/api/lifecycle", {method:"POST", headers:{origin,"Content-Type":"application/json"}, body:JSON.stringify(body)});
it("requires signed admins even when public demo is enabled", async () => {
  for (const session of [null, {role:"reviewer",tenantId:"a"}, {role:"demo",tenantId:"a"}]) {
    state.session=session;
    expect((await GET(new Request("http://localhost/api/lifecycle"))).status).toBe(403);
    expect((await POST(post({action:"request"}))).status).toBe(403);
  }
  expect(state.request).not.toHaveBeenCalled();
});
it("binds operations to the signed tenant and forwards exact confirmation", async () => {
  const id="00000000-0000-4000-8000-000000000001";
  expect((await POST(post({action:"confirm",id,confirmation:"DELETE a",tenant_id:"b"}))).status).toBe(200);
  expect(state.request).toHaveBeenCalledWith("a",`/deletions/${id}/confirm`,"POST",{confirmation:"DELETE a"});
});
it("blocks cross-origin writes, unknown actions and invalid IDs", async () => {
  expect((await POST(post({action:"sweep"},"https://attacker.test"))).status).toBe(403);
  expect((await POST(post({action:"unfence"}))).status).toBe(400);
  expect((await POST(post({action:"advance",id:"../b"}))).status).toBe(400);
  expect(state.request).not.toHaveBeenCalled();
});
it("downloads privately and rejects JSON demo mode", async () => {
  const id="00000000-0000-4000-8000-000000000001";
  const result=await GET(new Request(`http://localhost/api/lifecycle?export=${id}`));
  expect(result.headers.get("cache-control")).toBe("no-store");
  expect(result.headers.get("content-disposition")).toContain("attachment");
  state.mode="json-demo";
  expect((await POST(post({action:"request"}))).status).toBe(409);
});
