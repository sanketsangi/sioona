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
  it("requires the backend to explicitly acknowledge storage", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({ ok: false, receipt: key })));
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

describe("contact boundary protections", () => {
  it("rejects bots before forwarding", async () => {
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const response = await POST(request(JSON.stringify({ ...payload, companyWebsite: "https://spam.test" })));
    expect(response.status).toBe(422);
    expect(fetch).not.toHaveBeenCalled();
    expect((await response.json()).ok).toBe(false);
  });
  it("rejects cross-origin and cross-site submissions", async () => {
    for (const headers of [{ Origin: "https://evil.test" }, { "Sec-Fetch-Site": "cross-site" }]) {
      const req = request(); for (const [key, value] of Object.entries(headers)) req.headers.set(key, value);
      expect((await POST(req)).status).toBe(403);
    }
  });
  it("requires JSON and a valid identity", async () => {
    const req = request(); req.headers.set("Content-Type", "text/plain"); expect((await POST(req)).status).toBe(415);
    const missing = request(); missing.headers.delete("Idempotency-Key"); expect((await POST(missing)).status).toBe(400);
  });
  it("forwards validated Retry-After and excludes the honeypot from the backend payload", async () => {
    const fetch = vi.fn().mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": "120" } })); vi.stubGlobal("fetch", fetch);
    const response = await POST(request(JSON.stringify({ ...payload, companyWebsite: "" })));
    expect(response.status).toBe(429); expect(response.headers.get("Retry-After")).toBe("120");
    expect(JSON.parse(fetch.mock.calls[0][1].body)).not.toHaveProperty("companyWebsite");
    for (const value of ["tomorrow", "-1", "Wed, 21 Oct 2026 07:28:00 GMT"]) {
      fetch.mockResolvedValue(Response.json({}, { status: 429, headers: { "Retry-After": value } }));
      const retried = await POST(request());
      expect(retried.headers.get("Retry-After")).toBe(value.startsWith("Wed,") ? value : null);
    }
  });
});
