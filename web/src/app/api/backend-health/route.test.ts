import { afterEach, describe, expect, it, vi } from "vitest";
import * as backendClient from "@/lib/backend-client";
import { GET } from "./route";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GET /api/backend-health", () => {
  it("returns ok when FastAPI /health is ok", async () => {
    vi.spyOn(backendClient, "getBackendHealth").mockResolvedValue({
      status: "ok",
    });

    const res = await GET();
    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ status: "ok" });
  });

  it("returns 503 without leaking env when health is down", async () => {
    vi.spyOn(backendClient, "getBackendHealth").mockRejectedValue(
      new backendClient.BackendClientError(
        "Signal Score backend unreachable: timed out after 25000ms"
      )
    );

    const res = await GET();
    expect(res.status).toBe(503);
    const body = (await res.json()) as { status: string; error?: string };
    expect(body).toEqual({ status: "unavailable" });
    expect(JSON.stringify(body)).not.toMatch(/BACKEND_URL|localhost/i);
  });

  it("returns 503 when health payload is not ok", async () => {
    vi.spyOn(backendClient, "getBackendHealth").mockResolvedValue({
      status: "starting",
    });

    const res = await GET();
    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ status: "unavailable" });
  });
});
