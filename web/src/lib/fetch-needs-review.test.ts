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
        json: async () => ({ predictions: [
          {
            id: "pred-1",
            tenant_id: "tenant_demo",
            conversation_id: "conv_1",
            signal_type: "lead",
            confidence: 0.8,
            summary: "Intent",
            created_at: "2026-08-01T00:00:00.000Z",
          },
        ], next_cursor: null }),
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
        "/v1/tenants/tenant_demo/signals/needs-review/page?limit=20"
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
        json: async () => ({ predictions: [], next_cursor: null }),
      })
    );

    const result = await fetchNeedsReview("tenant_demo");
    expect(result.ok).toBe(true);
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/signals/needs-review/page?limit=100"
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
        json: async () => ({ predictions: page(100, 0), next_cursor: "cursor-100" }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ predictions: page(5, 100), next_cursor: null }),
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
        "/v1/tenants/tenant_demo/signals/needs-review/page?limit=100&conversation_id=conv_keep"
      )
    );
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("offset=");
    expect(String(fetchMock.mock.calls[0]?.[0])).not.toContain("other_pack");
    expect(fetchMock.mock.calls[1]?.[0]).toEqual(
      expect.stringContaining(
        "/v1/tenants/tenant_demo/signals/needs-review/page?limit=100&after=cursor-100&conversation_id=conv_keep"
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

it("reports a repeated cursor as an error rather than returning incomplete success", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200,
    json: async () => ({ predictions: [], next_cursor: "same" }) }));
  const result = await fetchNeedsReview("tenant_demo");
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain("repeated cursor");
});

it("rejects malformed or oversized pages without presenting partial success", async () => {
  for (const page of [{ predictions: [], next_cursor: {} }, { predictions: [{}, {}], next_cursor: null }]) {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => page }));
    const result = await fetchNeedsReview("tenant_demo", 1);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("invalid page");
  }
});

it("retains search text on every keyset page", async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(Response.json({ predictions: [], next_cursor: "next" }))
    .mockResolvedValueOnce(Response.json({ predictions: [], next_cursor: null }));
  vi.stubGlobal("fetch", fetchMock);
  expect(await fetchNeedsReview("tenant_demo", { q: "renewal", conversationIds: ["conv_keep"] }))
    .toEqual({ ok: true, predictions: [] });
  for (const [url] of fetchMock.mock.calls) {
    const params = new URL(String(url)).searchParams;
    expect(params.get("q")).toBe("renewal");
    expect(params.get("conversation_id")).toBe("conv_keep");
  }
  expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("after")).toBe("next");
});
