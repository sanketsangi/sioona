import { afterEach, describe, expect, it, vi } from "vitest";
import {
  BACKEND_FETCH_TIMEOUT_MS,
  BACKEND_MUTATION_TIMEOUT_MS,
  BackendClientError,
  VERCEL_BACKEND_MISCONFIG_MESSAGE,
  assertBackendUrlConfigured,
  createPrediction,
  createPredictionsBulk,
  BACKEND_HEALTH_TIMEOUT_MS,
  getBackendHealth,
  getConversations,
  getSignalScore,
  getPilotSettings,
  getTenantSignals,
  patchConversationGroundTruth,
  pruneConversations,
  putPilotSettings,
  setPredictionActed,
  submitFeedback,
  upsertConversation,
  upsertConversations,
  wipeTenantData,
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

  it("posts prediction bulk upsert with X-Tenant-Id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({
        predictions: [
          {
            id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
            tenant_id: "tenant_demo",
            conversation_id: "conv_1",
            signal_type: "lead",
            confidence: 0.9,
            summary: "Buying intent",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
        created: 1,
        updated: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await createPredictionsBulk("tenant_demo", [
      {
        conversation_id: "conv_1",
        signal_type: "lead",
        confidence: 0.9,
        summary: "Buying intent",
      },
    ]);

    expect(result.created).toBe(1);
    expect(result.predictions).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/predictions/bulk"),
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

  it("lists conversations scoped to overlay keep-set ids", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await getConversations("tenant_demo", {
      conversationIds: ["conv_hydrated", "conv_other"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(
        /\/v1\/tenants\/tenant_demo\/conversations\?conversation_id=conv_hydrated&conversation_id=conv_other$/
      ),
      expect.anything()
    );
  });

  it("asks for chats written with this upload and waits longer", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => [],
    });
    vi.stubGlobal("fetch", fetchMock);

    await getConversations("tenant_demo", {
      updatedSince: "2026-09-28T07:06:26.326Z",
      timeoutMs: 25_000,
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "updated_since=2026-09-28T07%3A06%3A26.326Z",
      ),
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it("prunes conversations not in the keep set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ deleted: 2, kept: 1 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await pruneConversations("tenant_demo", ["conv_keep"]);

    expect(result).toEqual({ deleted: 2, kept: 1 });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/conversations/prune"
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
    const body = JSON.parse(String(fetchMock.mock.calls[0][1].body)) as {
      keep_conversation_ids: string[];
    };
    expect(body.keep_conversation_ids).toEqual(["conv_keep"]);
  });

  it("wipes all tenant Neon rows via DELETE /data", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        conversations: 3,
        messages: 10,
        predictions: 5,
        feedback: 2,
        pilot_settings: 1,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await wipeTenantData("tenant_demo");

    expect(result).toEqual({
      conversations: 3,
      messages: 10,
      predictions: 5,
      feedback: 2,
      pilot_settings: 1,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/tenants/tenant_demo/data"),
      expect.objectContaining({
        method: "DELETE",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
  });

  it("upserts one conversation and patches ground_truth", async () => {
    const conversationBody = {
      id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      tenant_id: "tenant_demo",
      conversation_id: "conv_1",
      channel: "whatsapp",
      customer_name: "Priya",
      started_at: "2026-08-01T10:00:00.000Z",
      external_id: "priya_1",
      ground_truth: "retention",
      created_at: "2026-08-01T10:00:00.000Z",
      updated_at: "2026-08-01T10:00:00.000Z",
      messages: [],
    };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => conversationBody,
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ ...conversationBody, ground_truth: null }),
      });
    vi.stubGlobal("fetch", fetchMock);

    const created = await upsertConversation("tenant_demo", {
      conversation_id: "conv_1",
      channel: "whatsapp",
      customer_name: "Priya",
      started_at: "2026-08-01T10:00:00.000Z",
      external_id: "priya_1",
      ground_truth: "retention",
      messages: [],
    });
    expect(created.ground_truth).toBe("retention");
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining("/v1/conversations"),
      expect.objectContaining({ method: "POST" })
    );

    const cleared = await patchConversationGroundTruth(
      "tenant_demo",
      "conv_1",
      null
    );
    expect(cleared.ground_truth).toBeNull();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/conversations/conv_1"
      ),
      expect.objectContaining({
        method: "PATCH",
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

describe("getBackendHealth", () => {
  it("GETs /health with the cold-start timeout", async () => {
    vi.stubEnv("VERCEL", "");
    vi.stubEnv("BACKEND_URL", "");
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ status: "ok" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(getBackendHealth()).resolves.toEqual({ status: "ok" });
    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8000/health",
      expect.objectContaining({
        signal: expect.any(AbortSignal),
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
    expect(BACKEND_HEALTH_TIMEOUT_MS).toBe(25_000);
  });
});

describe("getSignalScore keep-set", () => {
  const scoreBody = {
    tenant_id: "tenant_demo",
    signal_score: 0.83,
    reviewed_count: 6,
    correct_count: 5,
    incorrect_count: 1,
    partially_correct_count: 0,
    by_signal_type: [],
  };

  it("POSTs keep-set conversation ids in the body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => scoreBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSignalScore("tenant_demo", {
      conversationIds: ["pack_1", "pack_2"],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/tenants\/tenant_demo\/signal-score$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conversation_ids: ["pack_1", "pack_2"] }),
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
  });

  it("POSTs empty conversation_ids for an explicit empty keep-set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        ...scoreBody,
        signal_score: null,
        reviewed_count: 0,
        correct_count: 0,
        incorrect_count: 0,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSignalScore("tenant_demo", { conversationIds: [] });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/tenants\/tenant_demo\/signal-score$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ conversation_ids: [] }),
      })
    );
  });

  it("omits conversation_id when keep-set is not passed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => scoreBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSignalScore("tenant_demo");

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("/v1/tenants/tenant_demo/signal-score");
    expect(url).not.toContain("conversation_id");
    expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({ method: "POST" });
  });

  it("sets date_from query params when keep-set is omitted", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => scoreBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSignalScore("tenant_demo", {
      date_from: "2026-09-04T10:11:15.000Z",
    });

    const url = String(fetchMock.mock.calls[0]?.[0]);
    expect(url).toContain("date_from=2026-09-04T10%3A11%3A15.000Z");
    expect(url).not.toContain("conversation_id");
    expect(fetchMock.mock.calls[0]?.[1]).not.toMatchObject({ method: "POST" });
  });

  it("sets date_from and date_to query params when provided", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => scoreBody,
    });
    vi.stubGlobal("fetch", fetchMock);

    await getSignalScore("tenant_demo", {
      conversationIds: ["pack_1"],
      date_from: "2026-08-07T12:00:00.000Z",
      date_to: "2026-08-14T12:00:00.000Z",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/v1\/tenants\/tenant_demo\/signal-score$/),
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          conversation_ids: ["pack_1"],
          date_from: "2026-08-07T12:00:00.000Z",
          date_to: "2026-08-14T12:00:00.000Z",
        }),
      })
    );
  });
});

describe("setPredictionActed / pilot settings client", () => {
  it("POSTs acted to FastAPI with X-Tenant-Id", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
        tenant_id: "tenant_demo",
        conversation_id: "conv_1",
        signal_type: "retention",
        confidence: 0.9,
        summary: "Churn risk",
        created_at: "2026-08-01T00:00:00.000Z",
        acted: true,
        feedback: null,
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await setPredictionActed(
      "tenant_demo",
      "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
      true
    );
    expect(result.acted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/signals/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee/acted"
      ),
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          "X-Tenant-Id": "tenant_demo",
        }),
      })
    );
    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      acted: true,
    });
  });

  it("returns null when GET pilot settings is 404", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: "Not Found",
        json: async () => ({ detail: "not found" }),
      })
    );

    await expect(getPilotSettings("tenant_demo")).resolves.toBeNull();
  });

  it("floors negative baseline and weekly_export_count on PUT", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: "pilot-1",
        tenant_id: "tenant_demo",
        baseline_opportunities: 0,
        baseline_note: null,
        weekly_export_count: 0,
        created_at: "2026-08-14T00:00:00.000Z",
        updated_at: "2026-08-14T00:00:00.000Z",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await putPilotSettings("tenant_demo", {
      baseline_opportunities: -3.9,
      weekly_export_count: -2.2,
    });

    expect(JSON.parse(String(fetchMock.mock.calls[0][1].body))).toEqual({
      baseline_opportunities: 0,
      baseline_note: null,
      weekly_export_count: 0,
      last_uploaded_file_name: null,
    });
  });
});
