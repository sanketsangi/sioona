import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchNeedsReview } from "./fetch-needs-review";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("fetchNeedsReview", () => {
  it("returns predictions when backend is up", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [
          {
            id: "pred-1",
            tenant_id: "tenant_demo",
            conversation_id: "conv_1",
            signal_type: "lead",
            confidence: 0.8,
            summary: "Intent",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ],
      })
    );

    const result = await fetchNeedsReview("tenant_demo", 20);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.predictions).toHaveLength(1);
      expect(result.predictions[0].id).toBe("pred-1");
    }
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/signals/needs-review?limit=20"
      ),
      expect.anything()
    );
  });

  it("requests the backend max limit=100 by default", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => [],
      })
    );

    const result = await fetchNeedsReview("tenant_demo");
    expect(result.ok).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/signals/needs-review?limit=100"
      ),
      expect.anything()
    );
  });

  it("pages past the first 100 and keeps the keep-set on every request", async () => {
    const page = (count: number, offset: number) =>
      Array.from({ length: count }, (_, index) => ({
        id: `pred-${offset + index}`,
        tenant_id: "tenant_demo",
        conversation_id: "conv_keep",
        signal_type: "lead",
        confidence: 0.8,
        summary: "Intent",
        created_at: "2026-08-01T00:00:00.000Z",
      }));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page(100, 0),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => page(5, 100),
      });
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNeedsReview("tenant_demo", {
      conversationIds: ["conv_keep"],
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.predictions).toHaveLength(105);
      expect(result.predictions[100]?.id).toBe("pred-100");
    }
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0]?.[0]).toEqual(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/signals/needs-review?limit=100&conversation_id=conv_keep"
      )
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("offset=");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("other_pack");
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/signals/needs-review?limit=100&offset=100&conversation_id=conv_keep"
      )
    );
  });

  it("returns no pending rows for an explicit empty keep-set", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchNeedsReview("tenant_demo", {
      conversationIds: [],
    });
    expect(result).toEqual({ ok: true, predictions: [] });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns explicit error when backend is unreachable", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED"))
    );

    const result = await fetchNeedsReview("tenant_demo");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/unreachable|ECONNREFUSED/i);
    }
  });
});
