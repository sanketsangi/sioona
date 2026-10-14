import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { currentStoreTenant, runWithTenant } from "@/lib/tenant-context";
import { signSession, sessionCookie } from "@/lib/auth-token";
vi.mock("@/lib/store", () => ({ readStore: vi.fn(async () => {
  const tenant = currentStoreTenant();
  await new Promise((resolve) => setTimeout(resolve, tenant === "tenant_alpha" ? 10 : 1));
  if (currentStoreTenant() !== tenant) throw new Error("Tenant changed across await");
  return { tenant: { id: tenant }, conversations: [{ id: "c1", sourceFile: "one.csv" }, { id: "c2", sourceFile: "two.csv" }], signals: [], messages: [] };
}) }));
vi.mock("@/lib/eval", () => ({
  computeEvalMetrics: (store: { tenant: { id: string } }) => ({ tenant: store.tenant.id }),
  applyBackendSignalScore: (metrics: unknown) => metrics,
  applyBackendSignalScoreToPilot: () => ({}),
}));
vi.mock("@/lib/fetch-signal-score", () => ({ fetchSignalScoreSafe: vi.fn(async (tenant: string) => {
  expect(currentStoreTenant()).toBe(tenant);
  return null;
}) }));
import { GET } from "./route";
import { fetchSignalScoreSafe } from "@/lib/fetch-signal-score";
afterEach(() => vi.unstubAllEnvs());

describe("actual signed Eval tenant scope", () => {
  it("isolates concurrent signed requests even inside an older outer tenant scope", async () => {
    vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
    vi.stubEnv("AUTH_SECRET", "signed-route-isolation-test-secret");
    const requests = await Promise.all(["tenant_alpha", "tenant_beta"].map(async (tenantId) => {
      const token = await signSession({ tenantId, role: "reviewer", email: `${tenantId}@example.test` });
      return new Request("http://localhost/api/eval", { headers: { cookie: sessionCookie(token).split(";")[0] } });
    }));
    await runWithTenant("tenant_outer", async () => {
      const responses = await Promise.all(requests.map(GET));
      const bodies = await Promise.all(responses.map((response) => response.json()));
      expect(bodies.map((body) => body.metrics.tenant)).toEqual(["tenant_alpha", "tenant_beta"]);
      expect(currentStoreTenant()).toBe("tenant_outer");
    });
  });
});

it("keeps signed file-scoped evaluation and unknown selections bounded", async () => {
  vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
  vi.stubEnv("AUTH_SECRET", "signed-route-isolation-test-secret");
  const token = await signSession({ tenantId: "tenant_alpha", role: "reviewer", email: "reviewer@example.test" });
  for (const [file, ids] of [["one.csv", ["c1"]], ["missing.csv", []]] as const) {
    vi.mocked(fetchSignalScoreSafe).mockClear();
    const response = await GET(new Request(`http://localhost/api/eval?file=${file}&scoreFrom=2026-10-01`, {
      headers: { cookie: sessionCookie(token).split(";")[0] },
    }));
    expect(response.status).toBe(200);
    expect(fetchSignalScoreSafe).toHaveBeenCalledWith("tenant_alpha", ids, { dateFrom: "2026-10-01T00:00:00.000Z" });
  }
});

it("forwards the inclusive end bound and rejects reversed signed ranges", async () => {
  vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
  vi.stubEnv("AUTH_SECRET", "signed-route-isolation-test-secret");
  const token = await signSession({ tenantId: "tenant_alpha", role: "reviewer", email: "reviewer@example.test" });
  const headers = { cookie: sessionCookie(token).split(";")[0] };
  vi.mocked(fetchSignalScoreSafe).mockClear();
  const valid = await GET(new Request("http://localhost/api/eval?file=one.csv&scoreFrom=2026-10-01&scoreTo=2026-10-04", { headers }));
  expect(valid.status).toBe(200);
  expect(fetchSignalScoreSafe).toHaveBeenLastCalledWith("tenant_alpha", ["c1"], {
    dateFrom: "2026-10-01T00:00:00.000Z", dateTo: "2026-10-04T23:59:59.999Z",
  });
  vi.mocked(fetchSignalScoreSafe).mockClear();
  const invalid = await GET(new Request("http://localhost/api/eval?file=one.csv&scoreFrom=2026-10-04&scoreTo=2026-10-01", { headers }));
  expect(invalid.status).toBe(422);
  expect(fetchSignalScoreSafe).not.toHaveBeenCalled();
});

it("resolves upload scope under the signed tenant and fails closed on missing uploads", async () => {
  const backend = await import("@/lib/backend-client");
  const membership = vi.spyOn(backend, "getUploadSnapshot").mockImplementation(async (tenantId, uploadId) => {
    expect(currentStoreTenant()).toBe(tenantId);
    if (uploadId !== "u1") throw new Error("not found");
    return { upload: { tenant_id: tenantId, upload_id: uploadId, status: "completed", source: "original.csv" }, run_id: "original", conversations: [{ conversation_id: "c2", channel: "upload", started_at: "2026-10-01T00:00:00Z", messages: [] }], detections: [{ conversation_id: "c2", output: [] }], predictions: [] } as never;
  });
  vi.stubEnv("SIOONA_AUTH_ENFORCE", "1");
  vi.stubEnv("AUTH_SECRET", "signed-route-isolation-test-secret");
  const token = await signSession({ tenantId: "tenant_alpha", role: "reviewer", email: "reviewer@example.test" });
  const headers = { cookie: sessionCookie(token).split(";")[0] };
  try {
    const valid = await GET(new Request("http://localhost/api/eval?uploadId=u1&scoreFrom=2026-10-01", { headers }));
    expect(valid.status).toBe(200);
    expect(fetchSignalScoreSafe).toHaveBeenLastCalledWith("tenant_alpha", ["c2"], { uploadId: "u1", dateFrom: "2026-10-01T00:00:00.000Z" });
    vi.mocked(fetchSignalScoreSafe).mockClear();
    const missing = await GET(new Request("http://localhost/api/eval?uploadId=missing&scoreFrom=2026-10-01", { headers }));
    expect(missing.status).toBe(503);
    expect(fetchSignalScoreSafe).not.toHaveBeenCalled();
  } finally { membership.mockRestore(); }
});

beforeEach(() => {
    vi.stubEnv("SIOONA_PILOT_USERS", JSON.stringify([{"email": "reviewer@example.test", "role": "reviewer", "tenantId": "tenant_alpha", "password": "synthetic-test-password"}, {"email": "tenant_alpha@example.test", "role": "reviewer", "tenantId": "tenant_alpha", "password": "synthetic-test-password"}, {"email": "tenant_beta@example.test", "role": "reviewer", "tenantId": "tenant_beta", "password": "synthetic-test-password"}]));
});
