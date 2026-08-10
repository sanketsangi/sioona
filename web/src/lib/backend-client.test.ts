import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_FETCH_TIMEOUT_MS,
  BackendClientError,
  createPrediction,
  getSignalScore,
} from "./backend-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
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
});
