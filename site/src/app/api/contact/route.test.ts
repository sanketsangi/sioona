import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
const key = "receipt-test-00000001";
const payload = { name: " Reviewer ", email: "reviewer@example.test", company: "Company" };
const request = (body = JSON.stringify(payload)) => new Request("http://localhost/api/contact", {
  method: "POST", headers: { "Content-Type": "application/json", "Idempotency-Key": key }, body,
});
beforeEach(() => {
  vi.stubEnv("PILOT_INTAKE_BACKEND_URL", "https://backend.example.test");
  vi.stubEnv("SIOONA_SERVICE_TOKEN", "server-only-test-token");
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("durable pilot intake proxy", () => {
  it("returns success only for a matching stored receipt and forwards stable identity", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({ ok: true, receipt: key }));
    vi.stubGlobal("fetch", fetch);
    expect(await (await POST(request())).json()).toEqual({ ok: true, receipt: key });
    expect(fetch.mock.calls[0][1].headers["Idempotency-Key"]).toBe(key);
    expect(JSON.parse(fetch.mock.calls[0][1].body).name).toBe("Reviewer");
  });
  it("never acknowledges a missing or mismatched receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: true })));
    expect((await POST(request())).status).toBe(503);
  });
  it("reports an unconfigured preview honestly", async () => {
    vi.stubEnv("PILOT_INTAKE_BACKEND_URL", "");
    expect((await POST(request())).status).toBe(503);
  });
  it("rejects a large streamed body before forwarding it", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    expect((await POST(request("x".repeat(20000)))).status).toBe(413);
    expect(fetch).not.toHaveBeenCalled();
  });
  it("preserves fields on backend timeout and exposes a retryable error", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("timeout")));
    const response = await POST(request());
    expect(response.status).toBe(503);
    expect((await response.json()).error).toContain("retry");
  });
  it("surfaces rate limits without claiming receipt", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({}, { status: 429 })));
    expect((await POST(request())).status).toBe(429);
  });
});
