import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_FETCH_TIMEOUT_MS,
  BackendClientError,
  VERCEL_BACKEND_MISCONFIG_MESSAGE,
  assertBackendUrlConfigured,
  createPrediction,
  getSignalScore,
} from "./backend-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("assertBackendUrlConfigured", () => {
  it("allows localhost default off Vercel", () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BACKEND_URL", "");
    expect(assertBackendUrlConfigured()).toBe("http://localhost:8000");
  });

  it("fails loud when Vercel has unset BACKEND_URL", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BACKEND_URL", "");
    expect(() => assertBackendUrlConfigured()).toThrow(
      VERCEL_BACKEND_MISCONFIG_MESSAGE
    );
  });

  it("fails loud when Vercel BACKEND_URL is localhost", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BACKEND_URL", "http://localhost:8000");
    expect(() => assertBackendUrlConfigured()).toThrow(
      VERCEL_BACKEND_MISCONFIG_MESSAGE
    );
  });

  it("accepts a public BACKEND_URL on Vercel", () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BACKEND_URL", "https://sioona-api.example.com/");
    expect(assertBackendUrlConfigured()).toBe("https://sioona-api.example.com");
  });
});

describe("backendFetch timeout", () => {
  it("preserves success path and X-Tenant-Id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        tenant_id: "tenant_demo",
        conversation_id: "conv_1",
        signal_type: "lead",
        confidence: 0.9,
        summary: "Buying intent",
        created_at: "2026-08-01T00:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const created = await createPrediction("tenant_demo", {
      conversation_id: "conv_1",
      signal_type: "lead",
      confidence: 0.9,
      summary: "Buying intent",
    });

    expect(created.id).toBe("aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/predictions"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
        signal: expect.any(AbortSignal),
      })
    );
  });

  it("aborts hung fetches within the timeout window", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error("missing abort signal"));
              return;
            }
            if (signal.aborted) {
              reject(new DOMException("The operation was aborted.", "AbortError"));
              return;
            }
            signal.addEventListener(
              "abort",
              () => {
                reject(
                  new DOMException("The operation was aborted.", "AbortError")
                );
              },
              { once: true }
            );
          })
      )
    );

    const pending = getSignalScore("tenant_demo").then(
      () => null,
      (err: unknown) => err
    );

    await vi.advanceTimersByTimeAsync(BACKEND_FETCH_TIMEOUT_MS);

    const err = await pending;
    expect(err).toBeInstanceOf(BackendClientError);
    expect((err as BackendClientError).message).toContain(
      `timed out after ${BACKEND_FETCH_TIMEOUT_MS}ms`
    );
  });

  it("still surfaces non-timeout network errors", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    await expect(getSignalScore("tenant_demo")).rejects.toMatchObject({
      name: "BackendClientError",
      message: expect.stringContaining("ECONNREFUSED"),
    });
  });

  it("surfaces Vercel BACKEND_URL misconfig before fetch", async () => {
    vi.stubEnv("VERCEL", "1");
    vi.stubEnv("BACKEND_URL", "");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(getSignalScore("tenant_demo")).rejects.toMatchObject({
      name: "BackendClientError",
      message: VERCEL_BACKEND_MISCONFIG_MESSAGE,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
