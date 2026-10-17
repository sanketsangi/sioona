import { afterEach, expect, it, vi } from "vitest";
import { POST } from "./route";
const key = "synthetic-request-1234";
function request(
  body: unknown = {
    name: " Test ",
    email: "test@example.com",
    company: "Example",
  },
  headers = {},
) {
  return new Request("http://localhost/api/pilot-requests", {
    method: "POST",
    headers: {
      Origin: "http://localhost",
      "Content-Type": "application/json",
      "Idempotency-Key": key,
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});
function configured() {
  vi.stubEnv("PILOT_INTAKE_BACKEND_URL", "http://localhost:8000");
  vi.stubEnv("SIOONA_SERVICE_TOKEN", "synthetic-token");
}
it("persists only validated business fields and accepts only a matching receipt", async () => {
  configured();
  const fetch = vi
    .fn()
    .mockResolvedValue(Response.json({ ok: true, receipt: key }));
  vi.stubGlobal("fetch", fetch);
  const result = await POST(request());
  expect(await result.json()).toEqual({ ok: true, receipt: key });
  expect(fetch).toHaveBeenCalledOnce();
  expect(fetch.mock.calls[0][0]).toBe(
    "http://localhost:8000/v1/pilot-requests",
  );
  expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({
    name: "Test",
    email: "test@example.com",
    company: "Example",
    role: "",
    platform: "",
    message: "",
  });
  expect(fetch.mock.calls[0][1].headers.Authorization).toBe(
    "Bearer synthetic-token",
  );
  expect(result.headers.get("Cache-Control")).toBe("no-store");
});
it.each([
  [{ name: "", email: "bad", company: "" }, {}, 422],
  [{ companyWebsite: "bot" }, {}, 422],
  [[], {}, 400],
  [null, {}, 400],
  [{}, { Origin: "https://evil.example" }, 403],
  [{}, { "Content-Type": "text/plain" }, 415],
  [{}, { "Idempotency-Key": "bad" }, 400],
  [{ message: "x".repeat(17000) }, {}, 413],
])(
  "rejects invalid requests without contacting the backend",
  async (body, headers, status) => {
    configured();
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    expect((await POST(request(body, headers))).status).toBe(status);
    expect(fetch).not.toHaveBeenCalled();
  },
);
it("preserves a safe Retry-After and refuses mismatched success receipts", async () => {
  configured();
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({}, { status: 429, headers: { "Retry-After": "120" } }),
      )
      .mockResolvedValueOnce(Response.json({ ok: true, receipt: "other" })),
  );
  const limited = await POST(request());
  expect(limited.status).toBe(429);
  expect(limited.headers.get("Retry-After")).toBe("120");
  expect((await POST(request())).status).toBe(503);
});
it("fails closed with missing configuration", async () => {
  vi.stubEnv("PILOT_INTAKE_BACKEND_URL", "");
  expect((await POST(request())).status).toBe(503);
});

it("requires actual contact-policy configuration in production", async () => {
  configured();
  vi.stubEnv("NODE_ENV", "production");
  vi.stubEnv("PILOT_CONTACT_HOSTING_REGION", "");
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  expect((await POST(request())).status).toBe(503);
  expect(fetch).not.toHaveBeenCalled();
});
it.each(["Sun, 18 Oct 2026 12:00:00 GMT", "invalid-retry"])(
  "bounds Retry-After %s",
  async (value) => {
    configured();
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          Response.json({}, { status: 429, headers: { "Retry-After": value } }),
        ),
    );
    expect((await POST(request())).headers.get("Retry-After")).toBe(
      value.startsWith("Sun") ? value : null,
    );
  },
);

it("uses the actual listener Host when Next supplies an internal localhost URL", async () => {
  configured();
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(Response.json({ ok: true, receipt: key })),
  );
  const response = await POST(
    request(undefined, {
      Host: "127.0.0.1:3328",
      Origin: "http://127.0.0.1:3328",
    }),
  );
  expect(response.status).toBe(200);
});
