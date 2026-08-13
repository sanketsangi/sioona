import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_FETCH_TIMEOUT_MS,
  BACKEND_MUTATION_TIMEOUT_MS,
  BackendClientError,
  VERCEL_BACKEND_MISCONFIG_MESSAGE,
  assertBackendUrlConfigured,
  createPrediction,
  getConversations,
  getSignalScore,
  getTenantSignals,
  submitFeedback,
  upsertConversations,
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

  it("posts conversation bulk upsert with X-Tenant-Id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        conversations: [],
        created: 1,
        updated: 0,
        messages_created: 1,
        messages_updated: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await upsertConversations("tenant_demo", [
      {
        conversation_id: "conv_1",
        channel: "whatsapp",
        customer_name: "Priya",
        started_at: "2026-08-01T10:00:00.000Z",
        external_id: "priya_1",
        messages: [
          {
            message_id: "msg_1",
            role: "customer",
            content: "hello",
            timestamp: "2026-08-01T10:00:00.000Z",
          },
        ],
      },
    ]);

    expect(result.created).toBe(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/conversations/bulk"),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
  });

  it("lists tenant conversations with X-Tenant-Id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          tenant_id: "tenant_demo",
          conversation_id: "conv_partner_1",
          channel: "whatsapp",
          customer_name: "Priya",
          started_at: "2026-08-01T10:00:00.000Z",
          external_id: "priya_1",
          created_at: "2026-08-01T10:00:00.000Z",
          updated_at: "2026-08-01T10:00:00.000Z",
          messages: [],
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getConversations("tenant_demo");

    expect(rows).toHaveLength(1);
    expect(rows[0].conversation_id).toBe("conv_partner_1");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/tenants/tenant_demo/conversations"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
  });

  it("lists tenant signals with optional feedback and X-Tenant-Id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [
        {
          id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          tenant_id: "tenant_demo",
          conversation_id: "conv_1",
          signal_type: "retention",
          confidence: 0.9,
          summary: "Churn risk",
          created_at: "2026-08-01T00:00:00.000Z",
          acted: true,
          feedback: {
            id: "fb-1",
            tenant_id: "tenant_demo",
            signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            feedback: "correct",
            note: "clear churn",
            reviewed_by: "shadow_reviewer",
            reviewed_at: "2026-08-02T00:00:00.000Z",
          },
        },
      ],
    });
    vi.stubGlobal("fetch", fetchMock);

    const rows = await getTenantSignals("tenant_demo");

    expect(rows).toHaveLength(1);
    expect(rows[0].feedback?.feedback).toBe("correct");
    expect(rows[0].acted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/tenants/tenant_demo/signals"),
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
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

  it("retries submitFeedback after a timeout then succeeds", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        (_url: string, init?: RequestInit) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal;
            if (!signal) {
              reject(new Error("missing abort signal"));
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
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: "fb-1",
          tenant_id: "tenant_demo",
          signal_id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
          feedback: "correct",
          note: null,
          reviewed_by: "shadow_reviewer",
          reviewed_at: "2026-08-01T00:00:00.000Z",
        }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const pending = submitFeedback(
      "tenant_demo",
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      { feedback: "correct", reviewed_by: "shadow_reviewer" }
    ).then(
      (value) => value,
      (err: unknown) => err
    );

    await vi.advanceTimersByTimeAsync(BACKEND_MUTATION_TIMEOUT_MS);
    await vi.advanceTimersByTimeAsync(250);

    const result = await pending;
    expect(result).toMatchObject({ feedback: "correct", id: "fb-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
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
